import asyncio
import json
import random
import re
import aiosqlite
from app.config import settings
from app.events import bus
from app.providers.base import Provider
from app.providers.ollama import OllamaProvider
from app.providers.openai_compat import OpenAICompatProvider

SYSTEM_PROMPT_PASS1 = """You are a strict, impartial evaluator of AI assistant answers.
You will see a TASK, optionally a REFERENCE answer, and one RESPONSE.
Score the RESPONSE only. Never guess which model wrote it.
Rate each criterion as an integer from 1 to 10:
correctness: facts and logic are right
completeness: everything the task asks for is covered
clarity: easy to follow, well organised
instruction_following: obeys every explicit constraint in the task
overall: your holistic judgement as an integer from 1 to 10, not an average
Rules:
Length is not quality. Penalise padding, repetition and content nobody asked for.
If a REFERENCE is present, treat it as ground truth for facts but accept different valid wording.
An empty answer, or a refusal without good reason, scores 1 on every criterion.
Write a rationale of at most 280 characters.
Return JSON only."""

SYSTEM_PROMPT_PASS2 = """You are a strict, impartial evaluator of AI assistant answers.
You will see a TASK, optionally a REFERENCE answer, and one RESPONSE.
Score the RESPONSE only. Never guess which model wrote it.
Rate each criterion as an integer from 1 to 10:
overall: your holistic judgement as an integer from 1 to 10, not an average
instruction_following: obeys every explicit constraint in the task
clarity: easy to follow, well organised
completeness: everything the task asks for is covered
correctness: facts and logic are right
Rules:
Length is not quality. Penalise padding, repetition and content nobody asked for.
If a REFERENCE is present, treat it as ground truth for facts but accept different valid wording.
An empty answer, or a refusal without good reason, scores 1 on every criterion.
Write a rationale of at most 280 characters.
Return JSON only."""

JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "correctness": {"type": "integer", "minimum": 1, "maximum": 10},
        "completeness": {"type": "integer", "minimum": 1, "maximum": 10},
        "clarity": {"type": "integer", "minimum": 1, "maximum": 10},
        "instruction_following": {"type": "integer", "minimum": 1, "maximum": 10},
        "overall": {"type": "integer", "minimum": 1, "maximum": 10},
        "rationale": {"type": "string"},
    },
    "required": [
        "correctness",
        "completeness",
        "clarity",
        "instruction_following",
        "overall",
        "rationale",
    ],
}


def parse_judge_output(text: str) -> dict | None:
    clean = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    clean = re.sub(r"```json\s*", "", clean)
    clean = re.sub(r"```", "", clean).strip()

    m = re.search(r"\{.*\}", clean, flags=re.DOTALL)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
        res = {}
        for k in (
            "correctness",
            "completeness",
            "clarity",
            "instruction_following",
            "overall",
        ):
            if k not in data or data[k] is None:
                return None
            val = int(data[k])
            res[k] = max(1, min(10, val))
        res["rationale"] = str(data.get("rationale", ""))[:280]
        return res
    except Exception:
        return None


async def get_judge_provider() -> tuple[Provider, str]:
    if settings.judge_provider == "gemini" and settings.gemini_api_key.strip():
        return (
            OpenAICompatProvider(
                "https://generativelanguage.googleapis.com/v1beta/openai/",
                settings.gemini_api_key,
                "gemini",
            ),
            settings.judge_model,
        )
    return OllamaProvider(settings.ollama_host), settings.judge_model


async def start_judge_phase(run_id: str) -> None:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row

        await db.execute(
            "update runs set phase = 'judging' where id = ?", (run_id,)
        )
        await db.commit()
        bus.publish(run_id, "phase", {"phase": "judging"})

        cursor = await db.execute(
            "select config from runs where id = ?", (run_id,)
        )
        run_row = await cursor.fetchone()
        cfg = json.loads(run_row["config"]) if run_row and run_row["config"] else {}
        passes = max(1, min(2, cfg.get("passes", 1)))

        judge_provider, judge_model = await get_judge_provider()

        try:
            async for _ in judge_provider.stream(
                judge_model,
                [{"role": "user", "content": "Reply with the single word ready."}],
                {"num_predict": 8, "keep_alive": "30m"},
            ):
                pass
        except Exception:
            pass

        cursor = await db.execute(
            """
            select r.id, r.run_id, r.prompt_id, r.model, r.text, p.text as prompt_text, p.reference
            from responses r
            join prompts p on r.prompt_id = p.id
            where r.run_id = ? and r.error is null
            """,
            (run_id,),
        )
        resp_rows = [dict(r) for r in await cursor.fetchall()]

        rnd = random.Random(42)
        rnd.shuffle(resp_rows)

        from app.routes.runs import cancelled_runs

        for pass_num in range(1, passes + 1):
            sys_prompt = (
                SYSTEM_PROMPT_PASS1 if pass_num == 1 else SYSTEM_PROMPT_PASS2
            )
            opts = {
                "temperature": 0.0 if pass_num == 1 else 0.3,
                "seed": 11 if pass_num == 1 else 23,
                "keep_alive": "30m",
                "format": JUDGE_SCHEMA,
            }

            for item in resp_rows:
                if run_id in cancelled_runs:
                    await judge_provider.unload(judge_model)
                    await db.execute(
                        "update runs set status = 'cancelled', phase = 'cancelled' where id = ?",
                        (run_id,),
                    )
                    await db.commit()
                    bus.publish(run_id, "phase", {"phase": "cancelled"})
                    bus.publish(run_id, "cancelled", {})
                    return

                ref = item["reference"] if item["reference"] else "none"
                user_msg = (
                    f"TASK:\n{item['prompt_text']}\n\n"
                    f"REFERENCE:\n{ref}\n\n"
                    f"RESPONSE:\n{item['text']}"
                )

                messages = [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_msg},
                ]

                parsed: dict | None = None
                for attempt in range(3):
                    raw_text = ""
                    try:
                        async for chunk in judge_provider.stream(
                            judge_model, messages, opts
                        ):
                            raw_text += chunk.text
                        parsed = parse_judge_output(raw_text)
                        if parsed:
                            break
                    except Exception:
                        pass

                if parsed:
                    cur = await db.execute(
                        """
                        insert into scores (
                            run_id, response_id, pass, overall, correctness, completeness, clarity, instruction_following, rationale
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            run_id,
                            item["id"],
                            pass_num,
                            parsed["overall"],
                            parsed["correctness"],
                            parsed["completeness"],
                            parsed["clarity"],
                            parsed["instruction_following"],
                            parsed["rationale"],
                        ),
                    )
                    await db.commit()
                    bus.publish(
                        run_id,
                        "score",
                        {
                            "id": cur.lastrowid,
                            "run_id": run_id,
                            "response_id": item["id"],
                            "pass": pass_num,
                            **parsed,
                        },
                    )
                else:
                    cur = await db.execute(
                        """
                        insert into scores (
                            run_id, response_id, pass, overall, correctness, completeness, clarity, instruction_following, rationale
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            run_id,
                            item["id"],
                            pass_num,
                            None,
                            None,
                            None,
                            None,
                            None,
                            "Parse failure",
                        ),
                    )
                    await db.commit()
                    bus.publish(
                        run_id,
                        "score",
                        {
                            "id": cur.lastrowid,
                            "run_id": run_id,
                            "response_id": item["id"],
                            "pass": pass_num,
                            "overall": None,
                            "correctness": None,
                            "completeness": None,
                            "clarity": None,
                            "instruction_following": None,
                            "rationale": "Parse failure",
                        },
                    )

        await judge_provider.unload(judge_model)

        try:
            from app.scoring import compute_and_publish_summary
            await compute_and_publish_summary(run_id)
        except (ImportError, AttributeError):
            pass

        try:
            from app.audit import run_audit_phase
            await run_audit_phase(run_id)
        except (ImportError, AttributeError):
            await db.execute(
                "update runs set status = 'done', phase = 'done' where id = ?",
                (run_id,),
            )
            await db.commit()
            bus.publish(run_id, "phase", {"phase": "done"})
            bus.publish(run_id, "done", {})
