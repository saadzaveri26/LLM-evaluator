---
name: setup_infra
description: Scaffold the ModelFit repo, install dependencies, pull Ollama models and verify the environment. Run first.
---

# setup_infra

## Goal
A working empty skeleton: backend boots, frontend boots, Ollama is reachable, the judge model exists.

## Steps

1. Create the repo (PowerShell)
```powershell
mkdir modelfit
cd modelfit
git init
mkdir backend, frontend, scripts, docs
```

2. Backend environment
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
```
Create `requirements.txt` by hand as UTF-8 with these lines, then install:
```
fastapi
uvicorn[standard]
httpx
pydantic
pydantic-settings
sse-starlette
aiosqlite
numpy
scipy
pytest
pytest-asyncio
respx
python-dotenv
```
```powershell
pip install -r requirements.txt
```
Do not generate it with `pip freeze > requirements.txt` in Windows PowerShell. That writes UTF-16 and breaks installs elsewhere.

3. Frontend
```powershell
cd ..
npx create-next-app@latest frontend --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
cd frontend
npx shadcn@latest init
npm i recharts
```

4. Ollama models. Pick 4 or 5 candidates that span different sizes, because the frontier chart needs a spread. Pull the judge separately.
```powershell
ollama pull gemma4
ollama pull qwen2.5:1.5b
ollama pull llama3.2:3b
ollama pull qwen2.5
ollama pull mistral
```
`llama3` can be added if there is RAM left. Run `ollama list` and note the exact tag of the Gemma 4 judge. If it differs from `gemma4`, set `JUDGE_MODEL` to the exact tag.

5. Ollama server settings. Quit the Ollama tray app, then:
```powershell
$env:OLLAMA_NUM_PARALLEL=1
$env:OLLAMA_MAX_LOADED_MODELS=1
ollama serve
```

6. Create `.env.example` from the variable list in `agents.md`, copy it to `.env`, and add `.env`, `.venv`, `node_modules`, `*.db`, `.next` to `.gitignore`.

7. Add an MIT `LICENSE` file at the repo root.

8. Write `scripts/check.py`: a short script that calls `GET {OLLAMA_HOST}/api/tags`, prints each model name with its size in GB, and exits with a non-zero code if `JUDGE_MODEL` is not in the list. It also prints whether `GROQ_API_KEY` and `OPENROUTER_API_KEY` are set, without printing their values.

9. Optional cloud models. Groq base URL is `https://api.groq.com/openai/v1`, OpenRouter is `https://openrouter.ai/api/v1`, Gemini is `https://generativelanguage.googleapis.com/v1beta/openai/`. Do not hardcode cloud model ids. They are read at runtime from each provider's `/models` endpoint.

10. `git add -A` then commit "scaffold".

## Done when
- `python scripts/check.py` exits 0
- `npm run dev` in `frontend` serves the default page on port 3000
- `.env` is ignored by git
