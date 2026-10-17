import statistics

import aiosqlite
import numpy as np

from app.config import settings
from app.events import bus


def compute_summary_for_models(
    models_stats: list[dict],
    responses: list[dict],
    scores: list[dict],
    prompt_count: int,
) -> list[dict]:
    summary: list[dict] = []

    for m in models_stats:
        m_name = m["model"]
        m_resps = [r for r in responses if r["model"] == m_name]
        err_count = sum(1 for r in m_resps if r.get("error"))

        valid_resps = [r for r in m_resps if not r.get("error")]
        if not valid_resps or err_count > (len(m_resps) / 2.0):
            summary.append(
                {
                    "model": m_name,
                    "provider": m.get("provider", "ollama"),
                    "quality": 0.0,
                    "quality_ci": [0.0, 0.0],
                    "tps": 0.0,
                    "ttft_ms": 0.0,
                    "total_ms": 0.0,
                    "mem_gb": m.get("vram_gb") or m.get("size_gb") or 0.0,
                    "errors": err_count,
                    "failed": True,
                }
            )
            continue

        resp_qualities: list[float] = []
        for r in valid_resps:
            r_scores = [
                s["overall"]
                for s in scores
                if s["response_id"] == r["id"] and s.get("overall") is not None
            ]
            if r_scores:
                resp_qualities.append(
                    (sum(r_scores) / len(r_scores)) * 10.0
                )
            else:
                resp_qualities.append(0.0)

        mean_q = float(np.mean(resp_qualities)) if resp_qualities else 0.0

        if len(resp_qualities) < 3:
            ci = [
                float(np.min(resp_qualities)) if resp_qualities else 0.0,
                float(np.max(resp_qualities)) if resp_qualities else 0.0,
            ]
        else:
            rng = np.random.default_rng(42)
            boot_means = []
            arr = np.array(resp_qualities)
            for _ in range(1000):
                sample = rng.choice(arr, size=len(arr), replace=True)
                boot_means.append(float(np.mean(sample)))
            ci = [
                float(np.percentile(boot_means, 2.5)),
                float(np.percentile(boot_means, 97.5)),
            ]

        tps_val = (
            float(statistics.median([r["tps"] for r in valid_resps]))
            if valid_resps
            else 0.0
        )
        ttft_val = (
            float(statistics.median([r["ttft_ms"] for r in valid_resps]))
            if valid_resps
            else 0.0
        )
        total_val = (
            float(statistics.median([r["total_ms"] for r in valid_resps]))
            if valid_resps
            else 0.0
        )

        mem = (
            (m.get("vram_gb") or m.get("size_gb") or 0.0)
            if m.get("provider") == "ollama"
            else 0.0
        )

        summary.append(
            {
                "model": m_name,
                "provider": m.get("provider", "ollama"),
                "quality": round(mean_q, 1),
                "quality_ci": [round(ci[0], 1), round(ci[1], 1)],
                "tps": round(tps_val, 1),
                "ttft_ms": round(ttft_val, 1),
                "total_ms": round(total_val, 1),
                "mem_gb": round(mem, 2),
                "errors": err_count,
                "failed": False,
            }
        )

    return summary


def compute_recommendation_data(
    summary: list[dict],
    quality_w: float = 5.0,
    speed_w: float = 5.0,
    memory_w: float = 5.0,
    axis: str = "memory",
    threshold: float = 0.9,
) -> dict:
    valid_models = [m for m in summary if not m.get("failed")]
    if not valid_models:
        return {
            "best": {"model": "", "reason": "No valid models evaluated"},
            "good_enough": {
                "model": "",
                "reason": "No valid models evaluated",
                "threshold": threshold,
            },
            "ranking": [],
            "frontier": [],
            "axis": axis,
        }

    q_vals = [m["quality"] for m in valid_models]
    s_vals = [m["tps"] for m in valid_models]
    costs = [
        (m["mem_gb"] if axis == "memory" else m["total_ms"])
        for m in valid_models
    ]

    min_q, max_q = min(q_vals), max(q_vals)
    min_s, max_s = min(s_vals), max(s_vals)
    min_c, max_c = min(costs), max(costs)

    w_sum = quality_w + speed_w + memory_w
    if w_sum <= 0:
        wq = ws = wm = 1.0 / 3.0
    else:
        wq, ws, wm = quality_w / w_sum, speed_w / w_sum, memory_w / w_sum

    ranking = []
    for m in valid_models:
        cost = m["mem_gb"] if axis == "memory" else m["total_ms"]
        nq = (m["quality"] - min_q) / (max_q - min_q) if max_q > min_q else 0.5
        ns = (m["tps"] - min_s) / (max_s - min_s) if max_s > min_s else 0.5
        nm = (max_c - cost) / (max_c - min_c) if max_c > min_c else 0.5
        score = wq * nq + ws * ns + wm * nm
        ranking.append(
            {
                "model": m["model"],
                "score": round(score * 100.0, 1),
                "quality": m["quality"],
                "tps": m["tps"],
                "mem_gb": m["mem_gb"],
            }
        )

    ranking.sort(key=lambda x: x["score"], reverse=True)
    best_item = ranking[0]
    best_m = next(m for m in valid_models if m["model"] == best_item["model"])

    local_models = [m for m in valid_models if m.get("provider") == "ollama"]
    if not local_models:
        local_models = valid_models

    frontier_models = []
    for candidate in local_models:
        c_cost = (
            candidate["mem_gb"] if axis == "memory" else candidate["total_ms"]
        )
        c_qual = candidate["quality"]
        dominated = False
        for other in local_models:
            if other["model"] == candidate["model"]:
                continue
            o_cost = other["mem_gb"] if axis == "memory" else other["total_ms"]
            o_qual = other["quality"]
            if (o_qual >= c_qual and o_cost <= c_cost) and (
                o_qual > c_qual or o_cost < c_cost
            ):
                dominated = True
                break
        if not dominated:
            frontier_models.append(candidate)

    frontier_models.sort(
        key=lambda m: (
            m["mem_gb"] if axis == "memory" else m["total_ms"],
            -m["quality"],
        )
    )
    frontier_names = [m["model"] for m in frontier_models]

    top_local = max(local_models, key=lambda m: m["quality"])
    cutoff = threshold * top_local["quality"]
    eligible = [m for m in local_models if m["quality"] >= cutoff]
    eligible.sort(
        key=lambda m: (
            m["mem_gb"] if axis == "memory" else m["total_ms"],
            -m["quality"],
        )
    )
    good_m = eligible[0] if eligible else top_local

    best_reason = f"Highest blended score at your weights: quality {best_m['quality']:.0f}, {best_m['tps']:.0f} tokens/s, {best_m['mem_gb']:.1f} GB."

    if good_m["model"] == top_local["model"]:
        good_reason = f"Top model {top_local['model']} is already the most efficient pick for quality {top_local['quality']:.0f}."
    else:
        q_diff = top_local["quality"] - good_m["quality"]
        speed_ratio = (
            good_m["tps"] / top_local["tps"] if top_local["tps"] > 0 else 1.0
        )
        good_reason = (
            f"Within {q_diff:.0f} points of top model on quality while using {good_m['mem_gb']:.1f} GB "
            f"instead of {top_local['mem_gb']:.1f} GB and running {speed_ratio:.1f}x faster."
        )

    return {
        "best": {"model": best_m["model"], "reason": best_reason},
        "good_enough": {
            "model": good_m["model"],
            "reason": good_reason,
            "threshold": threshold,
        },
        "ranking": ranking,
        "frontier": frontier_names,
        "axis": axis,
    }


async def compute_and_publish_summary(run_id: str) -> list[dict]:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row

        cursor = await db.execute(
            "select model, provider, size_gb, vram_gb from model_stats where run_id = ?",
            (run_id,),
        )
        stats = [dict(r) for r in await cursor.fetchall()]

        cursor = await db.execute(
            "select count(*) as cnt from prompts where run_id = ?", (run_id,)
        )
        row = await cursor.fetchone()
        prompt_cnt = row["cnt"] if row else 1

        cursor = await db.execute(
            "select id, model, error, ttft_ms, total_ms, tps from responses where run_id = ?",
            (run_id,),
        )
        resps = [dict(r) for r in await cursor.fetchall()]

        cursor = await db.execute(
            "select response_id, overall from scores where run_id = ?",
            (run_id,),
        )
        scores = [dict(r) for r in await cursor.fetchall()]

        summary = compute_summary_for_models(stats, resps, scores, prompt_cnt)
        bus.publish(run_id, "summary", {"summary": summary})
        return summary
