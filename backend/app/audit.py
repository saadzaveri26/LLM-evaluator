import json
import random
import re
import aiosqlite
import numpy as np
from scipy.stats import pearsonr, spearmanr
from app.config import settings
from app.events import bus
from app.judge import get_judge_provider
from app.providers.openai_compat import OpenAICompatProvider

PAIRWISE_SYSTEM_PROMPT = """You compare two answers to the same task. Pick the better one.
Length is not quality. Penalise padding and missing requirements.
Return JSON only: {"winner": "A" | "B" | "tie", "reason": "<=200 chars"}"""

PAIRWISE_SCHEMA = {
    "type": "object",
    "properties": {
        "winner": {"type": "string", "enum": ["A", "B", "tie"]},
        "reason": {"type": "string"},
    },
    "required": ["winner"],
}


def parse_pairwise(text: str) -> str:
    clean = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    clean = re.sub(r"```json\s*", "", clean)
    clean = re.sub(r"```", "", clean).strip()
    m = re.search(r"\{.*\}", clean, flags=re.DOTALL)
    if not m:
        return "tie"
    try:
        data = json.loads(m.group(0))
        w = str(data.get("winner", "tie")).strip()
        if w in ("A", "B", "tie"):
            return w
        return "tie"
    except Exception:
        return "tie"


async def run_audit_phase(run_id: str) -> None:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row

        await db.execute(
            "update runs set phase = 'auditing' where id = ?", (run_id,)
        )
        await db.commit()
        bus.publish(run_id, "phase", {"phase": "auditing"})

        cursor = await db.execute(
            "select config from runs where id = ?", (run_id,)
        )
        run_row = await cursor.fetchone()
        cfg = json.loads(run_row["config"]) if run_row and run_row["config"] else {}
        passes = max(1, min(2, cfg.get("passes", 1)))

        cursor = await db.execute(
            "select id, idx, text from prompts where run_id = ? order by idx asc",
            (run_id,),
        )
        prompts = [dict(p) for p in await cursor.fetchall()]

        cursor = await db.execute(
            "select id, prompt_id, model, text from responses where run_id = ? and error is null",
            (run_id,),
        )
        resps = [dict(r) for r in await cursor.fetchall()]

        cursor = await db.execute(
            "select response_id, pass, overall from scores where run_id = ? and overall is not null",
            (run_id,),
        )
        scores = [dict(s) for s in await cursor.fetchall()]

        notes: list[str] = []

        retest_obj = None
        retest_comp = None
        retest_pairs = []

        if passes >= 2:
            p1_vals = []
            p2_vals = []
            for r in resps:
                s1 = next(
                    (s["overall"] for s in scores if s["response_id"] == r["id"] and s["pass"] == 1),
                    None,
                )
                s2 = next(
                    (s["overall"] for s in scores if s["response_id"] == r["id"] and s["pass"] == 2),
                    None,
                )
                if s1 is not None and s2 is not None:
                    p1_vals.append(float(s1))
                    p2_vals.append(float(s2))
                    retest_pairs.append({"p1": s1, "p2": s2})

            if len(p1_vals) >= 2:
                mad = float(np.mean(np.abs(np.array(p1_vals) - np.array(p2_vals))))
                if np.var(p1_vals) == 0 or np.var(p2_vals) == 0:
                    rho = float(1.0 - (mad / 9.0))
                else:
                    sr = spearmanr(p1_vals, p2_vals)
                    rho = float(sr.statistic) if not np.isnan(sr.statistic) else float(1.0 - (mad / 9.0))
                retest_comp = max(0.0, rho)
                retest_obj = {
                    "rho": round(rho, 2),
                    "mad": round(mad, 2),
                    "n": len(p1_vals),
                }
            else:
                notes.append("Not enough score pairs to compute retest consistency.")
        else:
            notes.append("Pass 2 was not run, so retest consistency could not be measured.")

        length_points = []
        resp_means = {}
        for r in resps:
            r_scores = [s["overall"] for s in scores if s["response_id"] == r["id"]]
            if r_scores:
                mean_s = float(np.mean(r_scores))
                words = len((r["text"] or "").split())
                resp_means[r["id"]] = {"words": words, "score": mean_s, "model": r["model"], "prompt_id": r["prompt_id"]}
                length_points.append({"words": words, "score": round(mean_s, 1), "model": r["model"]})

        length_obj = {"r": 0.0, "n": len(resp_means), "flag": False}
        length_comp = None

        if len(resp_means) >= 3:
            prompt_rs = []
            for p in prompts:
                p_items = [v for v in resp_means.values() if v["prompt_id"] == p["id"]]
                if len(p_items) >= 3:
                    ws = [it["words"] for it in p_items]
                    scs = [it["score"] for it in p_items]
                    if np.var(ws) > 0 and np.var(scs) > 0:
                        pr = pearsonr(ws, scs)
                        if not np.isnan(pr.statistic):
                            prompt_rs.append(float(pr.statistic))
            if prompt_rs:
                r_val = float(np.mean(prompt_rs))
            else:
                ws = [it["words"] for it in resp_means.values()]
                scs = [it["score"] for it in resp_means.values()]
                if np.var(ws) > 0 and np.var(scs) > 0:
                    pr = pearsonr(ws, scs)
                    r_val = float(pr.statistic) if not np.isnan(pr.statistic) else 0.0
                else:
                    r_val = 0.0

            flag = bool(abs(r_val) > 0.5)
            length_obj = {"r": round(r_val, 2), "n": len(resp_means), "flag": flag}
            length_comp = 1.0 - min(1.0, abs(r_val))
            if flag:
                notes.append(
                    "The judge tends to prefer longer answers. Check the length scatter before trusting close results."
                )

        possible_pairs = []
        for p in prompts:
            p_resps = [r for r in resps if r["prompt_id"] == p["id"]]
            for i in range(len(p_resps)):
                for j in range(i + 1, len(p_resps)):
                    if p_resps[i]["model"] != p_resps[j]["model"]:
                        possible_pairs.append((p, p_resps[i], p_resps[j]))

        order_obj = {"consistency": 0.0, "pairs": 0, "a_win_rate": 0.0}
        order_comp = None

        if possible_pairs:
            rnd = random.Random(42)
            chosen_pairs = rnd.sample(possible_pairs, min(12, len(possible_pairs)))

            judge_prov, judge_mod = await get_judge_provider()
            try:
                consistent_count = 0
                first_wins = 0
                total_calls = len(chosen_pairs) * 2

                for p, rA, rB in chosen_pairs:
                    msg1 = [
                        {"role": "system", "content": PAIRWISE_SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": f"TASK:\n{p['text']}\n\nANSWER A:\n{rA['text']}\n\nANSWER B:\n{rB['text']}",
                        },
                    ]
                    raw1 = ""
                    async for chunk in judge_prov.stream(
                        judge_mod, msg1, {"temperature": 0.0, "format": PAIRWISE_SCHEMA}
                    ):
                        raw1 += chunk.text
                    w1 = parse_pairwise(raw1)
                    if w1 == "A":
                        first_wins += 1
                        m_winner1 = rA["model"]
                    elif w1 == "B":
                        m_winner1 = rB["model"]
                    else:
                        m_winner1 = "tie"

                    msg2 = [
                        {"role": "system", "content": PAIRWISE_SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": f"TASK:\n{p['text']}\n\nANSWER A:\n{rB['text']}\n\nANSWER B:\n{rA['text']}",
                        },
                    ]
                    raw2 = ""
                    async for chunk in judge_prov.stream(
                        judge_mod, msg2, {"temperature": 0.0, "format": PAIRWISE_SCHEMA}
                    ):
                        raw2 += chunk.text
                    w2 = parse_pairwise(raw2)
                    if w2 == "A":
                        first_wins += 1
                        m_winner2 = rB["model"]
                    elif w2 == "B":
                        m_winner2 = rA["model"]
                    else:
                        m_winner2 = "tie"

                    if m_winner1 == m_winner2:
                        consistent_count += 1

                await judge_prov.unload(judge_mod)

                consistency = consistent_count / len(chosen_pairs)
                a_win_rate = first_wins / float(total_calls)
                order_obj = {
                    "consistency": round(consistency, 2),
                    "pairs": len(chosen_pairs),
                    "a_win_rate": round(a_win_rate, 2),
                }
                order_comp = consistency
                if a_win_rate > 0.6 or a_win_rate < 0.4:
                    notes.append("The judge favours whichever answer is shown first.")
            except Exception:
                pass

        cross_obj = None
        cross_comp = None
        if (
            settings.cross_judge_provider
            and settings.cross_judge_model
            and (
                (settings.cross_judge_provider == "groq" and settings.groq_api_key.strip())
                or (settings.cross_judge_provider == "openrouter" and settings.openrouter_api_key.strip())
            )
        ):
            pass

        judge_base = settings.judge_model.split(":")[0].lower()
        candidate_bases = [
            m.split(":")[0].lower()
            for m in list(cfg.get("models", []))
            + [c.get("model", "").split(":")[0].lower() for c in cfg.get("cloud", [])]
        ]
        self_judged = judge_base in candidate_bases
        if self_judged:
            notes.append(
                "The judge model is also a candidate and may favour its own style."
            )

        if len(prompts) < 3:
            notes.append(
                "Too few prompts for stable statistics. Add more for a firmer verdict."
            )

        weights = {"retest": 0.35, "length": 0.25, "order": 0.25, "cross": 0.15}
        vals = {"retest": retest_comp, "length": length_comp, "order": order_comp, "cross": cross_comp}

        active_weights = {k: w for k, w in weights.items() if vals[k] is not None}
        if active_weights:
            total_w = sum(active_weights.values())
            score_sum = sum(active_weights[k] * vals[k] for k in active_weights)
            trust = int(round(100.0 * (score_sum / total_w)))
        else:
            trust = 50

        trust = max(0, min(100, trust))

        if trust >= 75:
            label = "Reliable"
        elif trust >= 50:
            label = "Use with caution"
        else:
            label = "Do not rely on a single judge"

        audit_dict = {
            "trust": trust,
            "label": label,
            "retest": retest_obj or {"rho": 0.0, "mad": 0.0, "n": 0},
            "length": length_obj,
            "order": order_obj,
            "cross": cross_obj,
            "self_judged": self_judged,
            "notes": notes,
            "retest_pairs": retest_pairs,
            "length_points": length_points,
        }

        await db.execute(
            "insert or replace into audits (run_id, body) values (?, ?)",
            (run_id, json.dumps(audit_dict)),
        )
        await db.execute(
            "update runs set status = 'done', phase = 'done' where id = ?",
            (run_id,),
        )
        await db.commit()

        bus.publish(run_id, "audit", {"audit": audit_dict})
        bus.publish(run_id, "phase", {"phase": "done"})
        bus.publish(run_id, "done", {})
