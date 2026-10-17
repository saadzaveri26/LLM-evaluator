import asyncio
import json
import secrets
from datetime import UTC, datetime

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.db import get_db
from app.events import bus
from app.runner import start_run_task
from app.schemas import (
    RecommendationResponse,
    ResponseItem,
    RunCreateRequest,
    RunCreateResponse,
    RunDetail,
    RunListItem,
    RunModelItem,
    ScoreItem,
    SummaryItem,
)

router = APIRouter(prefix="/api", tags=["runs"])

cancelled_runs: set[str] = set()


@router.post("/runs", response_model=RunCreateResponse)
async def create_run(
    body: RunCreateRequest, db: aiosqlite.Connection = Depends(get_db)
) -> RunCreateResponse:
    all_models = list(body.models) + [c.model for c in body.cloud]
    if len(all_models) < 1 or len(all_models) > 8:
        raise HTTPException(
            status_code=422, detail="Between 1 and 8 models required"
        )

    run_id = secrets.token_urlsafe(6)
    created_at = datetime.now(UTC).isoformat()
    config_json = json.dumps(body.model_dump())

    await db.execute(
        "insert into runs (id, created_at, status, phase, config) values (?, ?, ?, ?, ?)",
        (run_id, created_at, "queued", "queued", config_json),
    )

    for idx, p in enumerate(body.prompts):
        await db.execute(
            "insert into prompts (run_id, idx, text, reference) values (?, ?, ?, ?)",
            (run_id, idx, p.text, p.reference),
        )

    await db.commit()

    asyncio.create_task(start_run_task(run_id))

    return RunCreateResponse(id=run_id)


@router.get("/runs", response_model=list[RunListItem])
async def list_runs(
    db: aiosqlite.Connection = Depends(get_db),
) -> list[RunListItem]:
    cursor = await db.execute(
        "select id, created_at, status, config from runs order by created_at desc limit 30"
    )
    rows = await cursor.fetchall()
    items: list[RunListItem] = []
    for r in rows:
        cfg = json.loads(r["config"]) if r["config"] else {}
        mods = list(cfg.get("models", [])) + [
            c.get("model") for c in cfg.get("cloud", [])
        ]
        prompts = cfg.get("prompts", [])
        first_text = prompts[0].get("text", "") if prompts else ""
        items.append(
            RunListItem(
                id=r["id"],
                created_at=r["created_at"],
                status=r["status"],
                models=mods,
                prompt_count=len(prompts),
                first_prompt=first_text,
            )
        )
    return items


@router.get("/runs/{id}", response_model=RunDetail)
async def get_run(
    id: str, db: aiosqlite.Connection = Depends(get_db)
) -> RunDetail:
    cursor = await db.execute(
        "select id, created_at, status, phase, config from runs where id = ?",
        (id,),
    )
    run_row = await cursor.fetchone()
    if not run_row:
        raise HTTPException(status_code=404, detail="Run not found")

    cfg = json.loads(run_row["config"]) if run_row["config"] else {}

    cursor = await db.execute(
        "select model, provider, size_gb, vram_gb from model_stats where run_id = ?",
        (id,),
    )
    stat_rows = await cursor.fetchall()
    models_list = [
        RunModelItem(
            name=s["model"],
            provider=s["provider"],
            size_gb=s["size_gb"],
            vram_gb=s["vram_gb"],
            local=(s["provider"] == "ollama"),
        )
        for s in stat_rows
    ]

    cursor = await db.execute(
        "select id, prompt_id, model, text, ttft_ms, total_ms, tps, out_tokens, error from responses where run_id = ?",
        (id,),
    )
    resp_rows = await cursor.fetchall()
    responses_list = [
        ResponseItem(
            id=r["id"],
            prompt_id=r["prompt_id"],
            model=r["model"],
            text=r["text"] or "",
            ttft_ms=r["ttft_ms"] or 0.0,
            total_ms=r["total_ms"] or 0.0,
            tps=r["tps"] or 0.0,
            out_tokens=r["out_tokens"] or 0,
            error=r["error"],
        )
        for r in resp_rows
    ]

    cursor = await db.execute(
        "select response_id, pass, overall, correctness, completeness, clarity, instruction_following, rationale from scores where run_id = ?",
        (id,),
    )
    score_rows = await cursor.fetchall()
    scores_list = [
        ScoreItem(
            response_id=s["response_id"],
            pass_num=s["pass"],
            overall=s["overall"],
            correctness=s["correctness"],
            completeness=s["completeness"],
            clarity=s["clarity"],
            instruction_following=s["instruction_following"],
            rationale=s["rationale"] or "",
        )
        for s in score_rows
    ]

    cursor = await db.execute(
        "select body from audits where run_id = ?", (id,)
    )
    audit_row = await cursor.fetchone()
    audit_obj = json.loads(audit_row["body"]) if audit_row and audit_row["body"] else None

    summary_list: list[SummaryItem] = []
    if models_list:
        for m in models_list:
            m_resps = [r for r in responses_list if r.model == m.name]
            m_scores = [
                s
                for s in scores_list
                if any(
                    r.id == s.response_id and r.model == m.name
                    for r in responses_list
                )
            ]
            q = (
                sum(s.overall for s in m_scores) / len(m_scores)
                if m_scores
                else 0.0
            )
            tps = (
                sum(r.tps for r in m_resps) / len(m_resps) if m_resps else 0.0
            )
            ttft = (
                sum(r.ttft_ms for r in m_resps) / len(m_resps)
                if m_resps
                else 0.0
            )
            errs = sum(1 for r in m_resps if r.error is not None)
            summary_list.append(
                SummaryItem(
                    model=m.name,
                    quality=round(q, 2),
                    quality_ci=[round(max(0.0, q - 0.5), 2), round(min(10.0, q + 0.5), 2)],
                    tps=round(tps, 2),
                    ttft_ms=round(ttft, 2),
                    mem_gb=round(m.vram_gb or m.size_gb, 2),
                    errors=errs,
                )
            )

    return RunDetail(
        id=run_row["id"],
        status=run_row["status"],
        phase=run_row["phase"],
        created_at=run_row["created_at"],
        config=cfg,
        models=models_list,
        responses=responses_list,
        scores=scores_list,
        summary=summary_list,
        audit=audit_obj,
    )


@router.get("/runs/{id}/events")
async def stream_run_events(id: str) -> EventSourceResponse:
    async def event_generator():
        async for evt in bus.subscribe(id):
            yield {
                "event": evt["event"],
                "data": json.dumps(evt["data"]),
            }

    return EventSourceResponse(event_generator())


@router.post("/runs/{id}/cancel")
async def cancel_run(
    id: str, db: aiosqlite.Connection = Depends(get_db)
) -> dict[str, bool]:
    cancelled_runs.add(id)
    await db.execute(
        "update runs set status = 'cancelled', phase = 'cancelled' where id = ?",
        (id,),
    )
    await db.commit()
    bus.publish(id, "phase", {"phase": "cancelled"})
    bus.publish(id, "cancelled", {})
    return {"ok": True}


@router.get("/runs/{id}/recommendation", response_model=RecommendationResponse)
async def get_recommendation(
    id: str,
    quality: float = Query(5.0),
    speed: float = Query(5.0),
    memory: float = Query(5.0),
    axis: str = Query("memory"),
    threshold: float = Query(0.9),
    db: aiosqlite.Connection = Depends(get_db),
) -> RecommendationResponse:
    run_detail = await get_run(id, db)
    if not run_detail.summary:
        raise HTTPException(status_code=409, detail="Run has no summary yet")

    from app.scoring import compute_recommendation_data

    sum_dicts = [s.model_dump() for s in run_detail.summary]
    res_data = compute_recommendation_data(
        sum_dicts, quality, speed, memory, axis, threshold
    )
    return RecommendationResponse(**res_data)

