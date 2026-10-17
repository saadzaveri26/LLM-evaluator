---
name: build_recommender
description: Turn raw responses and scores into a per-model summary, a weighted recommendation, a Pareto frontier and the smallest-good-enough pick.
---

# build_recommender

## Goal
`scoring.py` holds the maths behind the headline feature. It must be deterministic, tested, and fast enough to recompute on every slider change.

## Summary per model
For each model:
- `quality`: mean `overall` across all prompts, using the mean of the passes for each response, scaled to 0 to 100 by multiplying by 10
- `quality_ci`: 95 percent bootstrap interval of `quality`, resampling prompts 1000 times with a fixed seed. If there are fewer than 3 prompts return the min and max instead
- `tps`: median tokens per second across prompts
- `ttft_ms`: median time to first token
- `mem_gb`: `size` from `model_stats` for local models, null for cloud
- `errors`: count of failed responses

Models with more than half of their responses failing are dropped from the ranking and shown as failed.

## Weighted ranking
Inputs: weights `quality`, `speed`, `memory` each 0 to 10, and `axis` of `memory` or `latency`.
1. Min-max normalise across the candidate set: `q` from quality, `s` from `tps`, `m` from inverted `mem_gb` (smaller is better). If all values are equal the normalised value is 0.5
2. `score = (wq*q + ws*s + wm*m) / (wq + ws + wm)`, and if the weights sum to 0 use equal weights
3. Sort descending

## Pareto frontier
Cost is `mem_gb` when `axis` is `memory`, otherwise median total latency in ms. A model is on the frontier if no other model has quality greater than or equal and cost less than or equal with at least one strict. Return frontier names sorted by cost ascending. Cloud reference models are never on the local frontier.

## Smallest good enough
`threshold` defaults to 0.9. Let `top` be the highest quality among local models. The good-enough pick is the model with the lowest cost whose `quality >= threshold * top`. If two tie on cost take the higher quality.

## Reason strings
Plain templated text, no model call. Examples:
- Best: `Highest blended score at your weights: quality 78, 41 tokens/s, 4.7 GB.`
- Good enough: `Within 6 points of the top model on quality while using 1.9 GB instead of 4.7 GB and running 2.3x faster.`
Compute the ratios from the data and round sensibly.

## Endpoint
Wire `GET /api/runs/{id}/recommendation` to these functions with query parameter defaults from the contract. Return 409 while the run has no summary yet.

## Tests
`tests/test_scoring.py` with hand-made summaries:
- A dominated model never appears on the frontier
- With `threshold` 1.0 the good-enough pick is the top-quality model
- With all weights 0 the ranking uses equal weights and does not divide by zero
- Normalisation handles all-equal values
- Bootstrap is identical on two calls

## Done when
- `GET /api/runs/{id}/recommendation` returns a best model, a good-enough model and a frontier for a finished run
- Changing the weights changes the ranking order in an expected direction
