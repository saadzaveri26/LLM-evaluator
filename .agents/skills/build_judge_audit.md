---
name: build_judge_audit
description: Measure whether the Gemma 4 judge can be trusted using retest consistency, length bias, order bias and optional cross-judge agreement, then combine them into a trust score.
---

# build_judge_audit

## Goal
`audit.py` runs after judging and produces the audit object from the contract. This is the feature that makes ModelFit different: the verdict comes with evidence about how reliable the judge is.

## Phase flow
Set phase `auditing`, run the four checks, save the JSON in `audits`, publish an `audit` event, set phase `done`, publish `done`. If a check cannot run, set its result to null and add a plain sentence to `notes`. Never fail the whole run because of the audit.

## Check 1: retest consistency (needs `passes` 2)
Pair pass 1 and pass 2 `overall` for every response.
- `rho`: Spearman correlation. If either series has zero variance, `rho` is `1 - mad/9`
- `mad`: mean absolute difference between the passes
- `n`: number of pairs
Component `retest = max(0, rho)`.

## Check 2: length bias
For each prompt with at least 3 models, Pearson correlation between the word count of the response and its mean `overall`. Average the per-prompt correlations. If no prompt has 3 models, use one pooled correlation. Zero variance counts as 0.
- `r`: the averaged correlation, `n`: responses used
- `flag`: true when `abs(r) > 0.5`
Component `length = 1 - min(1, abs(r))`.

## Check 3: order bias (pairwise swap)
Choose up to 12 random response pairs, each pair from the same prompt and different models (fixed seed). For each pair ask the judge twice, once as A then B and once as B then A, with this system prompt:
```
You compare two answers to the same task. Pick the better one.
Length is not quality. Penalise padding and missing requirements.
Return JSON only: {"winner": "A" | "B" | "tie", "reason": "<=200 chars"}
```
Use temperature 0 and the schema `{"winner": enum A,B,tie}` with `reason`.
- Map the swapped answer back to the original response ids
- `consistency`: share of pairs where both orders pick the same underlying response (two ties also count as consistent)
- `pairs`: number of pairs
- `a_win_rate`: share of all 2 x pairs calls where the first-shown answer won
Component `order = consistency`.
Reload the judge once at the start of this check and unload it at the end.

## Check 4: cross-judge agreement (optional)
Only when `CROSS_JUDGE_PROVIDER` and `CROSS_JUDGE_MODEL` are set and the key exists. Score up to 30 randomly chosen responses with the same judge prompt through the cloud provider. Spearman against the Gemma 4 mean scores. Return `{rho, n, provider, model}`. Component `cross = max(0, rho)`. Use 400 ms between calls.

## Trust score
```
weights: retest 0.35, length 0.25, order 0.25, cross 0.15
```
Drop any component that is null and renormalise the remaining weights. `trust = round(100 * weighted_sum)`.
Label:
- 75 and above: `Reliable`
- 50 to 74: `Use with caution`
- below 50: `Do not rely on a single judge`

## Notes the audit must write (plain sentences)
- When `flag` is true: `The judge tends to prefer longer answers. Check the length scatter before trusting close results.`
- When `a_win_rate` is above 0.6 or below 0.4: `The judge favours whichever answer is shown first.`
- When `self_judged`: `The judge model is also a candidate and may favour its own style.`
- When fewer than 3 prompts: `Too few prompts for stable statistics. Add more for a firmer verdict.`

## Extra data for the charts
Add to the audit object two arrays the frontend plots: `retest_pairs` as `[{p1, p2}]` and `length_points` as `[{words, score, model}]`.

## Tests
`tests/test_audit.py` with synthetic data:
- Identical passes give `rho` 1 and a high trust score
- Scores that rise exactly with word count give a flagged `r` near 1
- A judge mock that always answers A gives `consistency` 0 and `a_win_rate` 1
- Missing second pass sets `retest` to null and the weights still sum to 1

## Done when
- A finished run with 2 passes has an audit with a trust number, a label and at least one note when something is off
- The run still finishes when the cloud key is missing
