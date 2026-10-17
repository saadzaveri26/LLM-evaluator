import asyncio
from datetime import datetime, timezone
import json
import re
import time
import aiosqlite
from app.config import settings
from app.events import bus
from app.providers.base import Chunk, Provider
from app.providers.ollama import OllamaProvider
from app.providers.openai_compat import OpenAICompatProvider


def clean_text(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


async def get_provider(provider_name: str) -> Provider:
    if provider_name == "ollama":
        return OllamaProvider(settings.ollama_host)
    if provider_name == "groq":
        return OpenAICompatProvider(
            "https://api.groq.com/openai/v1", settings.groq_api_key, "groq"
        )
    if provider_name == "openrouter":
        return OpenAICompatProvider(
            "https://openrouter.ai/api/v1",
            settings.openrouter_api_key,
            "openrouter",
        )
    return OllamaProvider(settings.ollama_host)


async def start_run_task(run_id: str) -> None:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row

        cursor = await db.execute(
            "select config from runs where id = ?", (run_id,)
        )
        row = await cursor.fetchone()
        if not row:
            return
        cfg = json.loads(row["config"]) if row["config"] else {}

        await db.execute(
            "update runs set status = 'running', phase = 'generating' where id = ?",
            (run_id,),
        )
        await db.commit()
        bus.publish(run_id, "phase", {"phase": "generating"})

        cursor = await db.execute(
            "select id, idx, text, reference from prompts where run_id = ? order by idx asc",
            (run_id,),
        )
        prompt_rows = await cursor.fetchall()

        from app.routes.runs import cancelled_runs

        temp = cfg.get("temperature", 0.2)
        local_models = cfg.get("models", [])
        cloud_models = cfg.get("cloud", [])

        model_queue: list[tuple[str, str]] = []
        for m in local_models:
            model_queue.append((m, "ollama"))
        for c in cloud_models:
            model_queue.append((c.get("model", ""), c.get("provider", "groq")))

        for model_name, provider_name in model_queue:
            if run_id in cancelled_runs:
                await db.execute(
                    "update runs set status = 'cancelled', phase = 'cancelled' where id = ?",
                    (run_id,),
                )
                await db.commit()
                bus.publish(run_id, "phase", {"phase": "cancelled"})
                bus.publish(run_id, "cancelled", {})
                return

            provider = await get_provider(provider_name)
            bus.publish(run_id, "model_start", {"model": model_name})

            opts: dict = {
                "temperature": temp,
                "seed": 7,
                "num_ctx": 4096,
                "keep_alive": "5m",
            }

            try:
                async for _ in provider.stream(
                    model_name,
                    [{"role": "user", "content": "Reply with the single word ready."}],
                    {"num_predict": 8, "keep_alive": "5m"},
                ):
                    pass
            except Exception:
                pass

            if provider_name == "ollama" and isinstance(provider, OllamaProvider):
                ps_list = await provider.ps()
                matched = next(
                    (
                        p
                        for p in ps_list
                        if p["model"] == model_name
                        or p["model"].startswith(model_name)
                    ),
                    None,
                )
                sz = matched["size_gb"] if matched else 0.0
                vram = matched["vram_gb"] if matched else 0.0
                await db.execute(
                    "insert into model_stats (run_id, model, provider, size_gb, vram_gb) values (?, ?, ?, ?, ?)",
                    (run_id, model_name, provider_name, sz, vram),
                )
                await db.commit()
            else:
                await db.execute(
                    "insert into model_stats (run_id, model, provider, size_gb, vram_gb) values (?, ?, ?, ?, ?)",
                    (run_id, model_name, provider_name, 0.0, 0.0),
                )
                await db.commit()

            consecutive_errs = 0

            for p in prompt_rows:
                if run_id in cancelled_runs:
                    await provider.unload(model_name)
                    await db.execute(
                        "update runs set status = 'cancelled', phase = 'cancelled' where id = ?",
                        (run_id,),
                    )
                    await db.commit()
                    bus.publish(run_id, "phase", {"phase": "cancelled"})
                    bus.publish(run_id, "cancelled", {})
                    return

                if consecutive_errs >= 3:
                    bus.publish(
                        run_id,
                        "error",
                        {
                            "message": f"Model {model_name} failed 3 consecutive times"
                        },
                    )
                    break

                if provider_name != "ollama":
                    await asyncio.sleep(0.4)

                t0 = time.perf_counter()
                ttft: float | None = None
                full_text = ""
                final_chunk: Chunk | None = None
                err_msg: str | None = None

                try:
                    async for chunk in provider.stream(
                        model_name,
                        [{"role": "user", "content": p["text"]}],
                        opts,
                    ):
                        if not chunk.done and chunk.text and ttft is None:
                            ttft = (time.perf_counter() - t0) * 1000.0
                        full_text += chunk.text
                        if chunk.done:
                            final_chunk = chunk
                except Exception as err:
                    err_msg = str(err)
                    consecutive_errs += 1
                else:
                    consecutive_errs = 0

                t1 = time.perf_counter()
                total_ms = (t1 - t0) * 1000.0
                ttft_ms = ttft if ttft is not None else total_ms

                stats = (
                    final_chunk.stats
                    if (final_chunk and final_chunk.stats)
                    else {}
                )
                out_tokens = stats.get(
                    "out_tokens", max(1, len(full_text) // 4)
                )

                if provider_name == "ollama":
                    eval_ms = stats.get("eval_ms", 0.0)
                    tps = (
                        (out_tokens / (eval_ms / 1000.0))
                        if eval_ms > 0
                        else (
                            (out_tokens / ((total_ms - ttft_ms) / 1000.0))
                            if (total_ms - ttft_ms) > 0
                            else 0.0
                        )
                    )
                else:
                    tps = (
                        (out_tokens / ((total_ms - ttft_ms) / 1000.0))
                        if (total_ms - ttft_ms) > 0
                        else 0.0
                    )

                clean_resp = clean_text(full_text)

                cur = await db.execute(
                    """
                    insert into responses (
                        run_id, prompt_id, model, provider, text, ttft_ms, total_ms, tps, out_tokens, error
                    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id,
                        p["id"],
                        model_name,
                        provider_name,
                        clean_resp,
                        round(ttft_ms, 2),
                        round(total_ms, 2),
                        round(tps, 2),
                        out_tokens,
                        err_msg,
                    ),
                )
                await db.commit()
                resp_id = cur.lastrowid

                bus.publish(
                    run_id,
                    "response",
                    {
                        "id": resp_id,
                        "prompt_id": p["id"],
                        "model": model_name,
                        "provider": provider_name,
                        "text": clean_resp,
                        "ttft_ms": round(ttft_ms, 2),
                        "total_ms": round(total_ms, 2),
                        "tps": round(tps, 2),
                        "out_tokens": out_tokens,
                        "error": err_msg,
                    },
                )

            await provider.unload(model_name)
            bus.publish(run_id, "model_done", {"model": model_name})

        try:
            from app.judge import start_judge_phase
            await start_judge_phase(run_id)
        except (ImportError, AttributeError):
            await db.execute(
                "update runs set status = 'done', phase = 'done' where id = ?",
                (run_id,),
            )
            await db.commit()
            bus.publish(run_id, "phase", {"phase": "done"})
            bus.publish(run_id, "done", {})
