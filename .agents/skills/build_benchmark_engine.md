---
name: build_benchmark_engine
description: Build the sequential runner that loads each candidate model once, runs every prompt, and records speed, latency and memory.
---

# build_benchmark_engine

## Goal
`runner.py` takes a run id, executes the generation phase for every model, stores each response with timing, and streams events. It must give clean, repeatable speed numbers on one machine.

## Phases inside `run_job(run_id)`
1. Set phase `generating`
2. For each model, in order, one at a time:
   1. Publish `model_start`
   2. Warm-up call: send the prompt `Reply with the single word ready.` with `num_predict` 8, discard the output. This loads the model so `load_ms` does not pollute the first real prompt
   3. Read memory once after warm-up: for Ollama call `ps()` and take `size` and `size_vram` for this model in GB, store in `model_stats`. For cloud models store null
   4. For each prompt, in order, call `provider.stream`
   5. Persist the response and publish `response`
   6. Unload the model with `provider.unload` and publish `model_done`
3. After the last model, hand over to the judge phase (`build_judge`)

## Measuring a response
- `t0` is taken immediately before the request is sent
- `ttft_ms` is the time to the first non-empty text chunk
- `total_ms` is the time to the final chunk
- `tps` is `out_tokens / (eval_ms / 1000)` using the provider's own eval duration for Ollama. For OpenAI-compatible providers use `out_tokens / ((total_ms - ttft_ms) / 1000)`
- `out_tokens` comes from the final chunk stats
- Strip any `<think>...</think>` block from the stored text but keep its time in the totals

## Request options
Every call uses `temperature` from the run config (default 0.2), a fixed `seed` of 7, `num_ctx` 4096, and `keep_alive` of `"5m"` during the model's turn.

## Resilience
- A failure on one prompt stores the error string on that response row and the run continues
- Three consecutive failures on one model abort that model, publish an `error` event naming the model, and move on
- Per-request timeout 180 s
- Check the cancel flag before every prompt. On cancel, unload the current model, set status `cancelled`, publish `phase` `cancelled`

## Cloud reference models
Run them after all local models, same loop, using `openai_compat`. Their rows carry `provider` set to `groq` or `openrouter`. They appear in the frontier chart as hollow markers labelled reference, and are excluded from the recommendation unless the user toggles them in. Add a 400 ms delay between cloud calls to respect rate limits and retry once on HTTP 429 after reading `retry-after`.

## Persistence
Every response is committed as soon as it arrives so a page reload mid-run shows everything so far.

## Tests
`tests/test_runner.py` using `respx` to mock Ollama:
- Two fake models, two prompts: asserts 4 response rows, warm-up responses are not stored, and `unload` is called once per model
- A model whose second call fails: asserts the error row exists and the other responses still arrive
- Cancel mid-run: asserts the status becomes `cancelled` and no further responses are stored

## Done when
- A real run with 2 small local models and 3 prompts completes through the API and `GET /api/runs/{id}` shows all responses with non-zero `tps`
- Running the same run twice gives `tps` values within about 15 percent of each other
- Task manager shows only one candidate loaded at a time
