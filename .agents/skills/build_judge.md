---
name: build_judge
description: Implement the blind Gemma 4 judge that scores every response against a rubric using structured JSON output.
---

# build_judge

## Goal
After generation, Gemma 4 scores every response. The judge never sees model names and runs with the model loaded once.

## Judge provider
- `JUDGE_PROVIDER=ollama`: use the Ollama provider with `JUDGE_MODEL`
- `JUDGE_PROVIDER=gemini`: use the `openai_compat` provider with base URL `https://generativelanguage.googleapis.com/v1beta/openai/` and `GEMINI_API_KEY`. Confirm the Gemma 4 model id from the provider's `/models` list before using it

## Phase flow inside `judge.py`
1. Set phase `judging`
2. Unload any candidate still in memory, then warm up the judge once with `keep_alive` of `"30m"`
3. Build the list of every successful response (skip rows with `error`), then shuffle it with a fixed seed so no model is always judged first
4. For each pass from 1 to `passes`, score every response and store a `scores` row with `pass` set. Publish a `score` event each time
5. Unload the judge when finished
6. Compute and publish the `summary` (see `build_recommender`), then continue to the audit phase

## Strict blindness
The judge prompt contains only the task text, the optional reference answer and the response text. It never contains the model name, provider, timing, or the other responses.

## Judge prompt (system message, use exactly)
```
You are a strict, impartial evaluator of AI assistant answers.
You will see a TASK, optionally a REFERENCE answer, and one RESPONSE.
Score the RESPONSE only. Never guess which model wrote it.
Rate each criterion as an integer from 1 to 10:
correctness: facts and logic are right
completeness: everything the task asks for is covered
clarity: easy to follow, well organised
instruction_following: obeys every explicit constraint in the task
overall: your holistic judgement as an integer from 1 to 10, not an average
Rules:
Length is not quality. Penalise padding, repetition and content nobody asked for.
If a REFERENCE is present, treat it as ground truth for facts but accept different valid wording.
An empty answer, or a refusal without good reason, scores 1 on every criterion.
Write a rationale of at most 280 characters.
Return JSON only.
```
User message format:
```
TASK:
{prompt}

REFERENCE:
{reference or "none"}

RESPONSE:
{response}
```

## Structured output
For Ollama pass `format` as this JSON schema so the output is always parseable:
```json
{
  "type": "object",
  "properties": {
    "correctness": {"type": "integer", "minimum": 1, "maximum": 10},
    "completeness": {"type": "integer", "minimum": 1, "maximum": 10},
    "clarity": {"type": "integer", "minimum": 1, "maximum": 10},
    "instruction_following": {"type": "integer", "minimum": 1, "maximum": 10},
    "overall": {"type": "integer", "minimum": 1, "maximum": 10},
    "rationale": {"type": "string"}
  },
  "required": ["correctness", "completeness", "clarity", "instruction_following", "overall", "rationale"]
}
```
For Gemini request `response_format` with the same schema. If the provider rejects it, drop the field and rely on the prompt plus parsing.

## Passes
- Pass 1: temperature 0, seed 11, criteria in the order above
- Pass 2: temperature 0.3, seed 23, and list the criteria in the reverse order inside the system prompt. This is what makes the retest check in the audit meaningful

## Parsing and retries
Strip `<think>` blocks and code fences, then `json.loads`. Clamp every score to 1 to 10. On parse failure retry up to 2 times with the same inputs. After that store the row with `overall` null and skip it in all later maths.

## Self-judging flag
If the judge model name equals any candidate name (compare the part before the colon), set `self_judged` true on the audit and show a warning in the UI. By default the judge is removed from the candidate list in `GET /api/models`.

## Tests
`tests/test_judge.py`:
- Mock the provider to return fenced JSON with an extra sentence and assert it parses
- Mock invalid JSON three times and assert the row is stored with null `overall`
- Assert the messages sent to the judge never contain the model name

## Done when
- A finished run has one score row per response per pass
- Gemma 4 stays loaded for the whole judging phase and is the only model in memory
- Scores vary across responses instead of all being the same number
