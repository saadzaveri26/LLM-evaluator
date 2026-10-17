from collections.abc import AsyncIterator
import json
import aiosqlite
import httpx
import pytest
import respx
from app.config import settings
from app.db import init_db
from app.judge import parse_judge_output, start_judge_phase


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


def test_parse_judge_output_fenced_with_extra() -> None:
    text = """
    Here is the evaluation:
    ```json
    {
      "correctness": 9,
      "completeness": 8,
      "clarity": 10,
      "instruction_following": 9,
      "overall": 9,
      "rationale": "Clear and accurate response with all details."
    }
    ```
    I hope this helps!
    """
    res = parse_judge_output(text)
    assert res is not None
    assert res["overall"] == 9
    assert res["correctness"] == 9
    assert res["clarity"] == 10
    assert "Clear and accurate" in res["rationale"]


@pytest.mark.asyncio
@respx.mock
async def test_judge_phase_blindness_and_parse() -> None:
    host = settings.ollama_host

    respx.post(f"{host}/api/generate").mock(
        return_value=httpx.Response(200, json={})
    )

    captured_requests: list[dict] = []

    def chat_mock(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        captured_requests.append(body)
        ndjson = (
            json.dumps(
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "correctness": 8,
                                "completeness": 7,
                                "clarity": 8,
                                "instruction_following": 9,
                                "overall": 8,
                                "rationale": "Good answer.",
                            }
                        )
                    },
                    "done": False,
                }
            )
            + "\n"
            + json.dumps({"message": {"content": ""}, "done": True})
            + "\n"
        )
        return httpx.Response(200, content=ndjson.encode())

    respx.post(f"{host}/api/chat").mock(side_effect=chat_mock)

    run_id = "test_judge_run_1"
    model_secret_name = "super_secret_candidate_model_99"

    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            "insert into runs (id, created_at, status, phase, config) values (?, ?, ?, ?, ?)",
            (
                run_id,
                "2026-10-17T00:00:00Z",
                "running",
                "generating",
                json.dumps({"passes": 1, "models": [model_secret_name]}),
            ),
        )
        cur = await db.execute(
            "insert into prompts (run_id, idx, text, reference) values (?, ?, ?, ?)",
            (run_id, 0, "What is 2+2?", "4"),
        )
        prompt_id = cur.lastrowid
        await db.execute(
            """
            insert into responses (
                run_id, prompt_id, model, provider, text, ttft_ms, total_ms, tps, out_tokens
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                prompt_id,
                model_secret_name,
                "ollama",
                "The answer is 4.",
                100.0,
                500.0,
                10.0,
                5,
            ),
        )
        await db.commit()

    await start_judge_phase(run_id)

    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "select * from scores where run_id = ?", (run_id,)
        )
        score_rows = await cur.fetchall()
        assert len(score_rows) == 1
        assert score_rows[0]["overall"] == 8
        assert score_rows[0]["correctness"] == 8

    for req in captured_requests:
        for msg in req.get("messages", []):
            content = msg.get("content", "")
            assert model_secret_name not in content


@pytest.mark.asyncio
@respx.mock
async def test_judge_invalid_json_three_times() -> None:
    host = settings.ollama_host

    respx.post(f"{host}/api/generate").mock(
        return_value=httpx.Response(200, json={})
    )

    ndjson = (
        json.dumps(
            {"message": {"content": "This is totally invalid json"}, "done": False}
        )
        + "\n"
        + json.dumps({"message": {"content": ""}, "done": True})
        + "\n"
    )
    respx.post(f"{host}/api/chat").mock(
        return_value=httpx.Response(200, content=ndjson.encode())
    )

    run_id = "test_judge_run_invalid"

    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            "insert into runs (id, created_at, status, phase, config) values (?, ?, ?, ?, ?)",
            (
                run_id,
                "2026-10-17T00:00:00Z",
                "running",
                "generating",
                json.dumps({"passes": 1, "models": ["m1"]}),
            ),
        )
        cur = await db.execute(
            "insert into prompts (run_id, idx, text, reference) values (?, ?, ?, ?)",
            (run_id, 0, "Task 1", None),
        )
        prompt_id = cur.lastrowid
        await db.execute(
            """
            insert into responses (
                run_id, prompt_id, model, provider, text, ttft_ms, total_ms, tps, out_tokens
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (run_id, prompt_id, "m1", "ollama", "Answer 1", 100.0, 500.0, 10.0, 5),
        )
        await db.commit()

    await start_judge_phase(run_id)

    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "select * from scores where run_id = ?", (run_id,)
        )
        score_rows = await cur.fetchall()
        assert len(score_rows) == 1
        assert score_rows[0]["overall"] is None
        assert score_rows[0]["rationale"] == "Parse failure"
