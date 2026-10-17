from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.db import init_db
from app.main import app


@pytest.fixture(autouse=True)
async def setup_test_db() -> AsyncIterator[None]:
    await init_db()
    yield


@pytest.mark.asyncio
async def test_health() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        assert res.json() == {"ok": True}


@pytest.mark.asyncio
async def test_models() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/models")
        assert res.status_code == 200
        data = res.json()
        assert "local" in data
        assert "cloud" in data
        assert "judge" in data
        assert data["judge"]["available"] is True
        for m in data["local"]:
            assert m["name"] != data["judge"]["model"]


@pytest.mark.asyncio
async def test_create_run_validation() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/runs", json={"prompts": [], "models": ["test_model"]}
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_and_get_run() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/runs",
            json={
                "prompts": [{"text": "Hello", "reference": None}],
                "models": ["gemma4:latest"],
                "cloud": [],
                "passes": 1,
                "temperature": 0.2,
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert "id" in data
        run_id = data["id"]

        res2 = await client.get(f"/api/runs/{run_id}")
        assert res2.status_code == 200
        run_data = res2.json()
        assert run_data["id"] == run_id
        assert "models" in run_data
        assert "responses" in run_data
        assert "scores" in run_data
        assert "summary" in run_data
