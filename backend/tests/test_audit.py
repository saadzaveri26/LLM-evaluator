from collections.abc import AsyncIterator
import json
import aiosqlite
import httpx
import pytest
import respx
from app.audit import run_audit_phase
from app.config import settings
from app.db import init_db


@pytest.fixture(autouse=True)
async def setup_db() -> AsyncIterator[None]:
    await init_db()
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute("delete from runs")
        await db.execute("delete from prompts")
        await db.execute("delete from responses")
        await db.execute("delete from model_stats")
        await db.execute("delete from scores")
        await db.execute("delete from audits")
        await db.commit()
    yield


@pytest.mark.asyncio
@respx.mock
async def test_audit_identical_passes_high_trust() -> None:
    host = settings.ollama_host
    respx.post(f"{host}/api/generate").mock(
        return_value=httpx.Response(200, json={})
    )
    ndjson = (
        json.dumps(
            {"message": {"content": json.dumps({"winner": "tie", "reason": "Consistent"})}, "done": False}
        )
        + "\n"
        + json.dumps({"message": {"content": ""}, "done": True})
        + "\n"
    )
    respx.post(f"{host}/api/chat").mock(
        return_value=httpx.Response(200, content=ndjson.encode())
    )

    run_id = "test_audit_identical"
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            "insert into runs (id, created_at, status, phase, config) values (?, ?, ?, ?, ?)",
            (
                run_id,
                "2026-10-17T00:00:00Z",
                "running",
                "judging",
                json.dumps({"passes": 2, "models": ["m1", "m2"]}),
            ),
        )
        for i in range(3):
            await db.execute(
                "insert into prompts (id, run_id, idx, text) values (?, ?, ?, ?)",
                (i + 1, run_id, i, f"Prompt {i}"),
            )
            for m in ["m1", "m2"]:
                r_id = (i + 1) * 10 + (1 if m == "m1" else 2)
                await db.execute(
                    "insert into responses (id, run_id, prompt_id, model, text) values (?, ?, ?, ?, ?)",
                    (r_id, run_id, i + 1, m, "Short sample answer text."),
                )
                await db.execute(
                    "insert into scores (run_id, response_id, pass, overall) values (?, ?, 1, ?)",
                    (run_id, r_id, 8),
                )
                await db.execute(
                    "insert into scores (run_id, response_id, pass, overall) values (?, ?, 2, ?)",
                    (run_id, r_id, 8),
                )
        await db.commit()

    await run_audit_phase(run_id)

    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("select body from audits where run_id = ?", (run_id,))
        row = await cur.fetchone()
        assert row is not None
        body = json.loads(row["body"])
        assert body["retest"]["rho"] == 1.0
        assert body["retest"]["mad"] == 0.0
        assert body["trust"] >= 75


@pytest.mark.asyncio
@respx.mock
async def test_audit_length_bias_flagged() -> None:
    host = settings.ollama_host
    respx.post(f"{host}/api/generate").mock(
        return_value=httpx.Response(200, json={})
    )
    ndjson = (
        json.dumps(
            {"message": {"content": json.dumps({"winner": "tie", "reason": "Tie"})}, "done": False}
        )
        + "\n"
        + json.dumps({"message": {"content": ""}, "done": True})
        + "\n"
    )
    respx.post(f"{host}/api/chat").mock(
        return_value=httpx.Response(200, content=ndjson.encode())
    )

    run_id = "test_audit_length"
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            "insert into runs (id, created_at, status, phase, config) values (?, ?, ?, ?, ?)",
            (
                run_id,
                "2026-10-17T00:00:00Z",
                "running",
                "judging",
                json.dumps({"passes": 1, "models": ["m1", "m2", "m3"]}),
            ),
        )
        await db.execute(
            "insert into prompts (id, run_id, idx, text) values (1, ?, 0, 'P1')",
            (run_id,),
        )
        words_and_scores = [(10, 2), (50, 5), (150, 9), (300, 10)]
        for idx, (w_cnt, score) in enumerate(words_and_scores):
            txt = " ".join(["word"] * w_cnt)
            r_id = idx + 1
            m = f"m{idx + 1}"
            await db.execute(
                "insert into responses (id, run_id, prompt_id, model, text) values (?, ?, 1, ?, ?)",
                (r_id, run_id, m, txt),
            )
            await db.execute(
                "insert into scores (run_id, response_id, pass, overall) values (?, ?, 1, ?)",
                (run_id, r_id, score),
            )
        await db.commit()

    await run_audit_phase(run_id)

    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("select body from audits where run_id = ?", (run_id,))
        row = await cur.fetchone()
        body = json.loads(row["body"])
        assert body["length"]["flag"] is True
        assert body["length"]["r"] > 0.8
        assert any("prefer longer answers" in n for n in body["notes"])


@pytest.mark.asyncio
@respx.mock
async def test_audit_order_bias_mock_always_a() -> None:
    host = settings.ollama_host

    respx.post(f"{host}/api/generate").mock(
        return_value=httpx.Response(200, json={})
    )

    ndjson = (
        json.dumps(
            {"message": {"content": json.dumps({"winner": "A", "reason": "A was first"})}, "done": False}
        )
        + "\n"
        + json.dumps({"message": {"content": ""}, "done": True})
        + "\n"
    )
    respx.post(f"{host}/api/chat").mock(
        return_value=httpx.Response(200, content=ndjson.encode())
    )

    run_id = "test_audit_order"
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            "insert into runs (id, created_at, status, phase, config) values (?, ?, ?, ?, ?)",
            (
                run_id,
                "2026-10-17T00:00:00Z",
                "running",
                "judging",
                json.dumps({"passes": 1, "models": ["m1", "m2"]}),
            ),
        )
        await db.execute(
            "insert into prompts (id, run_id, idx, text) values (1, ?, 0, 'Task 1')",
            (run_id,),
        )
        await db.execute(
            "insert into responses (id, run_id, prompt_id, model, text) values (1, ?, 1, 'm1', 'Ans 1')",
            (run_id,),
        )
        await db.execute(
            "insert into responses (id, run_id, prompt_id, model, text) values (2, ?, 1, 'm2', 'Ans 2')",
            (run_id,),
        )
        await db.execute(
            "insert into scores (run_id, response_id, pass, overall) values (?, 1, 1, 7)",
            (run_id,),
        )
        await db.execute(
            "insert into scores (run_id, response_id, pass, overall) values (?, 2, 1, 7)",
            (run_id,),
        )
        await db.commit()

    await run_audit_phase(run_id)

    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("select body from audits where run_id = ?", (run_id,))
        row = await cur.fetchone()
        body = json.loads(row["body"])
        assert body["order"]["a_win_rate"] == 1.0
        assert body["order"]["consistency"] == 0.0
        assert any("favours whichever answer is shown first" in n for n in body["notes"])


@pytest.mark.asyncio
@respx.mock
async def test_audit_missing_second_pass() -> None:
    host = settings.ollama_host
    respx.post(f"{host}/api/generate").mock(
        return_value=httpx.Response(200, json={})
    )
    ndjson = (
        json.dumps(
            {"message": {"content": json.dumps({"winner": "tie", "reason": "Tie"})}, "done": False}
        )
        + "\n"
        + json.dumps({"message": {"content": ""}, "done": True})
        + "\n"
    )
    respx.post(f"{host}/api/chat").mock(
        return_value=httpx.Response(200, content=ndjson.encode())
    )

    run_id = "test_audit_no_pass2"
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            "insert into runs (id, created_at, status, phase, config) values (?, ?, ?, ?, ?)",
            (
                run_id,
                "2026-10-17T00:00:00Z",
                "running",
                "judging",
                json.dumps({"passes": 1, "models": ["m1"]}),
            ),
        )
        await db.execute(
            "insert into prompts (id, run_id, idx, text) values (1, ?, 0, 'P1')",
            (run_id,),
        )
        await db.execute(
            "insert into responses (id, run_id, prompt_id, model, text) values (1, ?, 1, 'm1', 'Ans 1')",
            (run_id,),
        )
        await db.execute(
            "insert into scores (run_id, response_id, pass, overall) values (?, 1, 1, 8)",
            (run_id,),
        )
        await db.commit()

    await run_audit_phase(run_id)

    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("select body from audits where run_id = ?", (run_id,))
        row = await cur.fetchone()
        body = json.loads(row["body"])
        assert body["retest"]["n"] == 0
        assert any("Pass 2 was not run" in n for n in body["notes"])
        assert 0 <= body["trust"] <= 100
