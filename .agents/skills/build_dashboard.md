---
name: build_dashboard
description: Build the Next.js screens: new run form, live run view, frontier plot, verdict panel, responses and judge audit.
---

# build_dashboard

## Goal
Implement every screen against the frozen API contract in `build_backend` using the design from `design_frontend`.

## Routes
- `/` new run form with the run list in the left rail
- `/run/[id]` live and finished run view

## New run form (`/`)
- Prompt editor: a list of textareas, add and remove buttons, a paste box that splits on blank lines, and a CSV import (first column prompt, optional second column reference). Max 20 prompts
- Three starter sets as one-click presets: Everyday coding, Summaries and rewriting, Reasoning and maths. Each has 5 short prompts you write yourself
- Model picker: a ruled list from `GET /api/models` with a checkbox, size in GB, and a note when RAM is likely too small. Preselect up to 4. Cloud reference models sit under a separate heading, only shown when the API returns them, labelled `Reference only`
- Passes: a switch for two judge passes, on by default, with the plain explanation `Scores each answer twice to measure how steady the judge is.`
- Priorities: three sliders for quality, speed and memory
- Button `Start benchmark`. Disabled with a reason when no prompt or no model is selected, and when `judge.available` is false show `Gemma 4 is not installed. Run ollama pull gemma4.`
- Post to `POST /api/runs`, then navigate to `/run/{id}`

## Run view (`/run/[id]`)
Use `useRun`. Show a phase line with the four phases and the current one marked. A `Stop run` button calls cancel.

### While running
- A matrix of models by prompts. Each cell fills when its response arrives and shows tokens per second. Cells waiting for the judge show a thin Cobalt underline once scored
- Live counters: responses done, scores done

### When done: frontier plot (hero)
Recharts `ScatterChart` filling the main column.
- X axis cost, toggle between Memory in GB and Latency in seconds, which sets the `axis` query parameter
- Y axis Quality score from 0 to 100
- One point per model, labelled by name directly with `LabelList`. Local models are filled Ink, cloud references hollow
- Vertical error bars from `quality_ci`
- The frontier drawn as a stepped line through the models returned in `frontier`
- A Moss ring and label `Good enough` around the good-enough model
- Failed models appear below the plot as a ruled list with their errors

### Verdict panel
- The good-enough model name in large type with its `reason`
- Under it the best-blend model and its `reason`
- Three sliders and a `Good enough within` control (80, 90, 95 percent) that call `GET /api/runs/{id}/recommendation`, debounced 200 ms. Update the ring, the ranking and the reasons without reloading the page
- A ranked table: model, score, quality, tokens per second, memory

### Tab: Responses
A prompt selector, then each model's answer in ruled columns on desktop and stacked on mobile, with its overall score, the four sub-scores, the judge's rationale, tokens per second and time to first token. Failed responses show the error text. Add a `Hide model names` switch that blinds the labels as A, B, C so a person can judge for themselves before reading the score.

### Tab: Judge audit
- A large trust number with the label, coloured Moss, Ink or Flare by band
- Four ruled sections, one per check, each with its metric in words and a small plot: retest as a scatter of pass 1 against pass 2 with the diagonal, length as a scatter of words against score with a fitted line, order as a short bar of consistency and first-shown win rate, cross-judge as a single agreement number or `Not run`
- The `notes` array as a plain list under the trust number
- If `self_judged` show a Flare notice above everything

### Download report
Button `Download report` builds a Markdown file in the browser: prompts, the recommendation reasons, the ranking table, the trust score with its notes. Use a Blob and an anchor, no server call.

## States
- Loading: reserve the layout and show a single thin progress line
- Error banner for the `error` event and for failed fetches, with the message from the API
- Run not found: say so and link to a new run
- Reconnect: if `EventSource` drops, refetch `GET /api/runs/{id}` and reopen once

## Quality checks before finishing
- Open the page at 375px and 1440px and confirm nothing overflows
- Tab through the whole run page with the keyboard
- Run with `prefers-reduced-motion` on and confirm no animation plays

## Done when
- A real run can be started, watched live and explored end to end in the browser
- Moving a slider updates the ring and the verdict within a moment
- The audit tab shows a trust number for a two-pass run
