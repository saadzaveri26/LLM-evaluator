---
name: audit_code
description: Final quality pass over backend and frontend: tests, failure paths, security, measurement sanity and convention checks.
---

# audit_code

## Goal
Find and fix problems before the demo. Do not add features in this skill.

## 1. Automated checks
```powershell
cd backend
pytest -q
pip install ruff
ruff check .
cd ../frontend
npx tsc --noEmit
npm run lint
npm run build
```
Fix every failure. A failing production build is a blocker.

## 2. Failure paths (test each by hand and add a test where cheap)
- Ollama stopped: `GET /api/models` returns a clear error and the form shows `Ollama is not running. Start it with ollama serve, then try again.`
- Judge model missing: the form blocks the run with the pull instruction
- A candidate that does not exist: that model fails with an error row, the others finish
- Judge returns broken JSON: rows get null `overall` and the run still completes
- Stop run mid-generation: status becomes `cancelled`, no model stays loaded (`ollama ps` is empty)
- Browser refresh mid-run: the page rebuilds from `GET /api/runs/{id}` and keeps streaming
- Two runs started back to back: the second waits in `queued`, they never run at the same time. Add a single asyncio lock around `run_job` if this is not already true

## 3. Security and safety
- `.env` and `*.db` are in `.gitignore`, and `git log -p` shows no key in any commit
- No API key appears in any frontend file or `NEXT_PUBLIC_` variable
- Request limits enforced: 20 prompts, 4000 characters each, 8 models
- CORS allows only `CORS_ORIGIN`
- Model output is rendered as plain text in React, never with `dangerouslySetInnerHTML`
- Prompts and responses are sent only to Ollama locally, and to a cloud provider only when the user selected a cloud reference model or a cross judge. State this in the README

## 4. Measurement sanity
- Run the same two-model benchmark twice and compare `tps`: they should agree within about 15 percent. If not, check that no other app is using the GPU and that `OLLAMA_NUM_PARALLEL` is 1
- Confirm warm-up output is not stored and `ttft_ms` does not include model load time
- Confirm memory numbers come from `/api/ps` and look plausible against `ollama ps`

## 5. Convention scan
Search the repo for violations and fix them:
```powershell
Get-ChildItem -Recurse backend\app, frontend\src -Include *.py, *.ts, *.tsx, *.css | Select-String -Pattern '^\s*(#|//|/\*)'
```
- Any comment, docstring or banner block must be deleted
- Single-use helper functions must be inlined
- Variable names that are long or vague must be shortened
- Delete unused files, imports, dead branches and `console.log` calls

## 6. Smoke script
Write `scripts/smoke.py`: it posts a run with 1 prompt and 1 small model, polls `GET /api/runs/{id}` until the status is `done`, and prints the trust score and the good-enough model. Exit non-zero on timeout (300 s) or failure. Run it once from a clean database.

## Done when
- Every command in section 1 passes
- Every item in sections 2 to 5 is checked off
- `scripts/smoke.py` exits 0 from a clean database
