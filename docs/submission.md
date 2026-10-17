# ModelFit — Hacktoberfest Hack Day Mumbai 2026 Submission

## Project Description
ModelFit benchmarks every local model you have on your own prompts, recommends the smallest one that is good enough, plots quality against speed and memory, and audits its own AI judge for consistency, length bias and order bias. Candidates and the Gemma 4 judge run locally through Ollama.

## Open-Source AI Track
Open-weight models are central to ModelFit for both candidate benchmarking and local judging. The entire codebase is MIT licensed, and runs completely offline on the user's hardware by default without sending prompt or evaluation data to external cloud APIs.

## Gemma 4 Track
Gemma 4 serves as the autonomous evaluator in ModelFit. It performs blind multi-pass evaluations against an objective 1-5 rubric using structured JSON schema enforcement. ModelFit further introduces a first-of-its-kind judge reliability audit specifically for Gemma 4—empirically calculating Spearman rho retest consistency, measuring Pearson length bias correlation, and executing pairwise order symmetry swap tests to generate a transparent 0-100 Judge Trust Score.

## Demo Walkthrough (2-3 Minutes)
1. **0:00 - The Hook:** "Which local model should you run for your task, and can you trust the judge that says so?"
2. **0:15 - Configuration:** Select workload preset (or paste domain prompts), choose candidate models, and launch benchmark.
3. **0:30 - Live Execution:** Watch the live matrix populate with TTFT, generation latency, tokens/sec, and memory footprint in real-time via SSE.
4. **1:00 - Pareto Frontier & Recommendation:** Demonstrate the Pareto frontier scatter plot. Drag the memory and quality sliders to show how the "Good Enough" model updates with 95% bootstrap confidence intervals.
5. **1:40 - Judge Audit:** Switch to the Judge Audit panel. Highlight the overall Trust Score, the length bias scatter plot, and the pairwise order swap symmetry tests.
6. **2:20 - Conclusion:** "The recommendation comes with evidence about the judge."
