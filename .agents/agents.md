# ModelFit

## One line
Find the smallest local model that is good enough for your own prompts, and see whether the AI judge behind that verdict can be trusted.


## Stack
- Backend: Python 3.11+, FastAPI, uvicorn, httpx (async), pydantic v2, pydantic-settings, sse-starlette, aiosqlite, numpy, scipy
- Tests: pytest, pytest-asyncio, respx
- Frontend: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Recharts
- Models: Ollama for local candidates and the Gemma 4 judge. Groq or OpenRouter (OpenAI-compatible) for optional cloud reference models and an optional second judge
- Storage: one SQLite file
- Realtime: Server-Sent Events, no websockets

## Repo layout
```
modelfit/
  .agents/            skills (this folder)
  backend/
    app/
      main.py
      config.py
      db.py
      schemas.py
      events.py
      runner.py
      judge.py
      audit.py
      scoring.py
      providers/
        base.py
        ollama.py
        openai_compat.py
      routes/
        models.py
        runs.py
    tests/
    requirements.txt
  frontend/
    src/app/
    src/components/
    src/lib/
  scripts/check.py
  .env.example
  LICENSE
  README.md
```

## Environment variables
```
OLLAMA_HOST=http://localhost:11434
JUDGE_PROVIDER=ollama
JUDGE_MODEL=gemma4
GROQ_API_KEY=
OPENROUTER_API_KEY=
CROSS_JUDGE_PROVIDER=groq
CROSS_JUDGE_MODEL=
GEMINI_API_KEY=
DB_PATH=modelfit.db
CORS_ORIGIN=http://localhost:3000
```
JUDGE_PROVIDER accepts ollama or gemini. Gemini uses its OpenAI-compatible endpoint, so Gemma 4 can also be reached through the Gemini API with no extra provider code.

## Code conventions (apply to every skill)
- No comments anywhere, in Python, TypeScript, CSS, SQL or config
- Short, obvious variable names (`res`, `rows`, `ms`, `tps`), no abbreviations that need explaining
- No helper function for logic used in only one place; inline it
- Code should read like a human developer wrote it quickly and cleanly: no banner blocks, no over-engineered abstractions, no docstrings
- Type hints in Python on function signatures, strict TypeScript
- Never put API keys in frontend code or in any NEXT_PUBLIC variable
- Commit after every finished skill with a one-line message

## Run order and time budget
| # | Skill | Time |
|---|---|---|
| 1 | setup_infra | 20 min |
| 2 | build_backend | 45 min |
| 3 | build_benchmark_engine | 50 min |
| 4 | build_judge | 40 min |
| 5 | build_recommender | 30 min |
| 6 | build_judge_audit | 45 min |
| 7 | design_frontend | 30 min |
| 8 | build_dashboard | 90 min |
| 9 | audit_code | 30 min |
| 10 | ship_submission | 40 min |

Work in order. Do not start a skill before the previous one's "Done when" list is true. Use the taste skills already in `.agents/skills` for all UI work.

## Cut list if time runs short (cut from the top)
1. Cloud second judge and cross-judge agreement
2. Bootstrap confidence intervals
3. Markdown report download
4. Gemini judge provider
5. Order-bias pairwise check

Never cut: sequential benchmark engine, Gemma 4 judge, recommendation with the good-enough pick, frontier chart, trust score with at least the retest and length checks.

## Hardware rules
- Candidates run one at a time. Never load two candidates together
- The judge runs only after every candidate has finished and been unloaded
- Set `OLLAMA_NUM_PARALLEL=1` and `OLLAMA_MAX_LOADED_MODELS=1` for clean speed numbers
