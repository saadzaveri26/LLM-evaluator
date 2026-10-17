from collections.abc import AsyncIterator
import json
import aiosqlite
import httpx
import pytest
import respx
from app.config import settings
from app.db import init_db
from app.runner import start_run_task


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
async def test_runner_two_models_two_prompts() -> None:
    host = settings.ollama_host

    ndjson_body = (
        json.dumps({"message": {"content": "Hello response"}, "done": False})
        + "\n"
        + json.dumps(
            {
                "message": {"content": ""},
                "done": True,
                "eval_count": 10,
                "eval_duration": 500000000,
                "load_duration": 100000000,
            }
        )
        + "\n"
    )

    chat_route = respx.post(f"{host}/api/chat").mock(
        return_value=httpx.Response(
            200,
            content=ndjson_body.encode(),
            headers={"content-type": "application/x-ndjson"},
        )
    )
    ps_route = respx.get(f"{host}/api/ps").mock(
        return_value=httpx.Response(
            200,
            json={
                "models": [
                    {"model": "m1", "size": 2000000000, "size_vram": 1000000000},
                    {"model": "m2", "size": 3000000000, "size_vram": 2000000000},
                ]
            },
        )
    )
    unload_route = respx.post(f"{host}/api/generate").mock(
        return_value=httpx.Response(200, json={})
    )

    run_id = "test_run_1"
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            "insert into runs (id, created_at, status, phase, config) values (?, ?, ?, ?, ?)",
            (
                run_id,
                "2026-10-17T00:00:00Z",
                "queued",
                "queued",
                json.dumps(
                    {
                        "models": ["m1", "m2"],
                        "cloud": [],
                        "temperature": 0.2,
                        "prompts": [{"text": "p1"}, {"text": "p2"}],
                    }
                ),
            ),
        )
        await db.execute(
            "insert into prompts (run_id, idx, text) values (?, ?, ?)",
            (run_id, 0, "p1"),
        )
        await db.execute(
            "insert into prompts (run_id, idx, text) values (?, ?, ?)",
            (run_id, 1, "p2"),
        )
        await db.commit()

    await start_run_task(run_id)

    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "select * from responses where run_id = ?", (run_id,)
        )
        rows = await cur.fetchall()
        assert len(rows) == 4
        for r in rows:
            assert r["text"] == "Hello response"
            assert r["tps"] > 0
            assert r["error"] is None

        cur2 = await db.execute(
            "select * from runs where id = ?", (run_id,)
        )
        run_row = await cur2.fetchone()
        assert run_row["status"] == "done"

    assert unload_route.call_count >= 2


@pytest.mark.asyncio
@respx.mock
async def test_runner_model_failure() -> None:
    host = settings.ollama_host

    respx.get(f"{host}/api/ps").mock(
        return_value=httpx.Response(200, json={"models": []})
    )
    respx.post(f"{host}/api/generate").mock(
        return_value=httpx.Response(200, json={})
    )

    call_count = 0

    def chat_side_effect(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            return httpx.Response(500, text="Internal Error")
        ndjson = (
            json.dumps({"message": {"content": "ok"}, "done": False})
            + "\n"
            + json.dumps(
                {
                    "message": {"content": ""},
                    "done": True,
                    "eval_count": 5,
                    "eval_duration": 100000000,
                }
            )
            + "\n"
        )
        return httpx.Response(200, content=ndjson.encode())

    respx.post(f"{host}/api/chat").mock(side_effect=chat_side_effect)

    run_id = "test_run_fail"
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            "insert into runs (id, created_at, status, phase, config) values (?, ?, ?, ?, ?)",
            (
                run_id,
                "2026-10-17T00:00:00Z",
                "queued",
                "queued",
                json.dumps(
                    {
                        "models": ["m1"],
                        "cloud": [],
                        "temperature": 0.2,
                        "prompts": [{"text": "p1"}, {"text": "p2"}],
                    }
                ),
            ),
        )
        await db.execute(
            "insert into prompts (run_id, idx, text) values (?, ?, ?)",
            (run_id, 0, "p1"),
        )
        await db.execute(
            "insert into prompts (run_id, idx, text) values (?, ?, ?)",
            (run_id, 1, "p2"),
        )
        await db.commit()

    await start_run_task(run_id)

    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "select * from responses where run_id = ?", (run_id,)
        )
        rows = await cur.fetchall()
        assert len(rows) == 2
        assert rows[0]["error"] is not None
        assert rows[1]["error"] is None


@pytest.mark.asyncio
@respx.mock
async def test_runner_cancel() -> None:
    host = settings.ollama_host

    respx.get(f"{host}/api/ps").mock(
        return_value=httpx.Response(200, json={"models": []})
    )
    respx.post(f"{host}/api/generate").mock(
        return_value=httpx.Response(200, json={})
    )

    ndjson = (
        json.dumps({"message": {"content": "ok"}, "done": False})
        + "\n"
        + json.dumps(
            {
                "message": {"content": ""},
                "done": True,
                "eval_count": 5,
                "eval_duration": 100000000,
            }
        )
        + "\n"
    )
    respx.post(f"{host}/api/chat").mock(
        return_value=httpx.Response(200, content=ndjson.encode())
    )

    run_id = "test_run_cancel"
    from app.routes.runs import cancelled_runs

    cancelled_runs.add(run_id)

    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            "insert into runs (id, created_at, status, phase, config) values (?, ?, ?, ?, ?)",
            (
                run_id,
                "2026-10-17T00:00:00Z",
                "queued",
                "queued",
                json.dumps(
                    {
                        "models": ["m1"],
                        "cloud": [],
                        "temperature": 0.2,
                        "prompts": [{"text": "p1"}],
                    }
                ),
            ),
        )
        await db.execute(
            "insert into prompts (run_id, idx, text) values (?, ?, ?)",
            (run_id, 0, "p1"),
        )
        await db.commit()

    await start_run_task(run_id)

    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "select * from responses where run_id = ?", (run_id,)
        )
        rows = await cur.fetchall()
        assert len(rows) == 0

        cur2 = await db.execute(
            "select status from runs where id = ?", (run_id,)
        )
        run_row = await cur2.fetchone()
        assert run_row["status"] == "cancelled"
