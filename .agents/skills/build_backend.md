---
name: build_backend
description: Build the FastAPI backend skeleton, SQLite storage, provider interface, event bus and the full API contract the frontend depends on.
---

# build_backend

## Goal
A FastAPI app with persistence, a provider abstraction and every endpoint stubbed to the contract below. The contract is frozen: the frontend skills depend on these exact shapes.

## Files to create under `backend/app`
`main.py`, `config.py`, `db.py`, `schemas.py`, `events.py`, `providers/base.py`, `providers/ollama.py`, `providers/openai_compat.py`, `routes/models.py`, `routes/runs.py`.

## config.py
`pydantic-settings` class reading every variable in `agents.md` from `.env`. One module-level `settings` instance.

## db.py
Open one aiosqlite connection per request through a FastAPI dependency. Create tables on startup if missing:
- `runs(id text primary key, created_at text, status text, phase text, config text)`
- `prompts(id integer primary key, run_id text, idx integer, text text, reference text)`
- `responses(id integer primary key, run_id text, prompt_id integer, model text, provider text, text text, ttft_ms real, total_ms real, tps real, out_tokens integer, error text)`
- `model_stats(run_id text, model text, provider text, size_gb real, vram_gb real)`
- `scores(id integer primary key, run_id text, response_id integer, pass integer, overall integer, correctness integer, completeness integer, clarity integer, instruction_following integer, rationale text)`
- `audits(run_id text primary key, body text)`

`config` and `body` hold JSON strings. Run ids are short random strings from `secrets.token_urlsafe(6)`.

## providers/base.py
A `Provider` protocol with:
- `async def stream(model: str, messages: list[dict], opts: dict) -> AsyncIterator[Chunk]`
- `async def list_models() -> list[ModelInfo]`
- `async def unload(model: str) -> None`

`Chunk` is a dataclass with `text: str`, `done: bool` and `stats: dict | None` (filled only on the final chunk with `out_tokens`, `prompt_tokens`, `load_ms`, `eval_ms`).

## providers/ollama.py
- `stream`: POST `{host}/api/chat` with `stream: true`, `options` taken from opts (`temperature`, `seed`, `num_ctx`), and `keep_alive` from opts. Parse each NDJSON line. On the line with `done: true`, convert `eval_count`, `eval_duration`, `load_duration` (nanoseconds) into the stats
- `list_models`: GET `/api/tags`, size in GB from `size` / 1e9
- `unload`: POST `/api/generate` with `{model, keep_alive: 0}`
- `ps()`: GET `/api/ps`, returns `size` and `size_vram` per loaded model
- Use a long read timeout (300 s) and a short connect timeout (5 s)

## providers/openai_compat.py
One class constructed with `base_url`, `api_key`, `name`.
- `stream`: POST `/chat/completions` with `stream: true` and `stream_options: {"include_usage": true}`. Read SSE `data:` lines until `[DONE]`. If usage is missing, estimate `out_tokens` as `len(text) / 4`
- `list_models`: GET `/models`, return the ids
- `unload`: no-op

## events.py
An in-memory bus keyed by run id. `publish(run_id, name, data)` puts an event on every subscriber queue and appends it to a per-run list so late subscribers get a replay. `subscribe(run_id)` is an async generator that first yields the replay, then live events, and ends after `done`, `error` or `cancelled`.

## API contract

`GET /api/health` returns `{ok: true}`

`GET /api/models` returns
```json
{
  "local": [{"name": "qwen2.5:latest", "size_gb": 4.7}],
  "cloud": [{"provider": "groq", "name": "model-id"}],
  "judge": {"provider": "ollama", "model": "gemma4", "available": true}
}
```
`cloud` is empty when no key is set. Remove the judge model from `local`.

`POST /api/runs` body
```json
{
  "prompts": [{"text": "...", "reference": null}],
  "models": ["qwen2.5:latest"],
  "cloud": [{"provider": "groq", "model": "model-id"}],
  "passes": 2,
  "temperature": 0.2
}
```
Validate: 1 to 20 prompts, each at most 4000 characters, 1 to 8 models, `passes` 1 or 2. Returns `{"id": "abc123"}` and starts the run as a background asyncio task.

`GET /api/runs` returns the last 30 runs as `[{id, created_at, status, models, prompt_count}]`.

`GET /api/runs/{id}` returns
```json
{
  "id": "", "status": "", "phase": "", "created_at": "",
  "config": {},
  "models": [{"name": "", "provider": "", "size_gb": 0, "vram_gb": 0, "local": true}],
  "responses": [{"id": 0, "prompt_id": 0, "model": "", "text": "", "ttft_ms": 0, "total_ms": 0, "tps": 0, "out_tokens": 0, "error": null}],
  "scores": [{"response_id": 0, "pass": 1, "overall": 0, "correctness": 0, "completeness": 0, "clarity": 0, "instruction_following": 0, "rationale": ""}],
  "summary": [{"model": "", "quality": 0, "quality_ci": [0, 0], "tps": 0, "ttft_ms": 0, "mem_gb": 0, "errors": 0}],
  "audit": null
}
```

`GET /api/runs/{id}/events` is an SSE stream. Event names and payloads:
- `phase` `{"phase": "generating"}` where phase is one of `queued, generating, judging, auditing, done, failed, cancelled`
- `model_start` `{"model": ""}` and `model_done` `{"model": ""}`
- `response` `{...response row}`
- `score` `{...score row}`
- `summary` `{"summary": [...]}`
- `audit` `{"audit": {...}}`
- `done` `{}`
- `error` `{"message": ""}`

`POST /api/runs/{id}/cancel` sets the cancel flag the runner checks between prompts.

`GET /api/runs/{id}/recommendation?quality=5&speed=5&memory=5&axis=memory&threshold=0.9` returns
```json
{
  "best": {"model": "", "reason": ""},
  "good_enough": {"model": "", "reason": "", "threshold": 0.9},
  "ranking": [{"model": "", "score": 0, "quality": 0, "tps": 0, "mem_gb": 0}],
  "frontier": ["model-a", "model-b"],
  "axis": "memory"
}
```

Audit object shape (produced by `build_judge_audit`):
```json
{
  "trust": 0, "label": "",
  "retest": {"rho": 0, "mad": 0, "n": 0},
  "length": {"r": 0, "n": 0, "flag": false},
  "order": {"consistency": 0, "pairs": 0, "a_win_rate": 0},
  "cross": null,
  "self_judged": false,
  "notes": []
}
```

## main.py
Create the app, enable CORS for `CORS_ORIGIN`, include both routers under `/api`, run table creation in a lifespan handler.

## Stubs
`runner.py`, `judge.py`, `audit.py`, `scoring.py` exist as empty modules for now. The `POST /api/runs` task can set the phase to `queued` then `done` until the next skills fill them in.

## Tests
`tests/test_api.py` with an httpx `AsyncClient` against the app: health returns ok, creating a run with 0 prompts returns 422, creating a valid run returns an id, fetching it returns the shape above.

## Done when
- `uvicorn app.main:app --reload` starts with no errors
- `pytest` passes
- `GET /api/models` lists the pulled Ollama models without the judge
