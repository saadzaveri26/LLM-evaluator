---
name: ship_submission
description: Prepare the README, demo, screenshots and MLH submission text for Hacktoberfest Hack Day Mumbai.
---

# ship_submission

## Goal
A public repo that a judge can understand in one minute and run in five, plus a demo that tells one clear story.

## 1. Repo hygiene
- Public GitHub repository with the MIT `LICENSE`
- Commits spread across the day on `main`, with readable messages
- `.env.example` present, no secrets committed
- A fresh clone must work with the README steps. Test that on a second folder

## 2. README structure
1. Title, the one-line description from `agents.md`, and one screenshot of the frontier plot
2. The problem in two sentences: people pick local models by guesswork and trust LLM judges without checking them
3. What it does: three short paragraphs for the recommender, the frontier chart and the judge audit
4. How it works: a simple diagram of generate, judge, audit, recommend, in text
5. Quick start: install Ollama, pull the models, set `.env`, start the backend and the frontend, with exact commands
6. Models: which are used as candidates, Gemma 4 as the judge, optional Groq and OpenRouter keys and what is sent to them
7. Privacy: everything runs locally unless the user adds a cloud key
8. Built at Hack Day: `This project was written from scratch on 17 October 2026 at Hacktoberfest Hack Day Mumbai. It builds on ideas from an earlier project, Synapse AI Arena, but shares no code.` Keep this sentence true. Only claim what applies
9. Limitations in plain words: small prompt sets give wide error bars, one judge model has its own taste, speed numbers depend on the machine
10. License

## 3. Demo script (2 to 3 minutes)
1. 0:00 One sentence: `Which local model should you run for your task, and can you trust the judge that says so?`
2. 0:15 Paste five real prompts, pick four models, press `Start benchmark`
3. 0:30 While it runs, show the live matrix filling in
4. 1:00 Frontier plot appears: point at the Good enough ring. Drag the memory slider and show the pick change
5. 1:40 Open Judge audit: show the trust number, then the length scatter or the order bias result that exposed something
6. 2:20 Close with the line: `The recommendation comes with evidence about the judge.`
Prepare a finished run beforehand as a fallback in case the live run is slow, and rehearse once with a stopwatch.

## 4. Screenshots to capture
- The frontier plot with the Good enough ring
- The judge audit tab
- The new run form
Save them in `docs/` and link them from the README.

## 5. Submission text
Short and concrete, adapt to what is actually built.

Project description:
`ModelFit benchmarks every local model you have on your own prompts, recommends the smallest one that is good enough, plots quality against speed and memory, and audits its own AI judge for consistency, length bias and order bias. Candidates and the Gemma 4 judge run locally through Ollama.`

Open-source AI track: say that open-weight models are central (candidates and judge), the code is MIT licensed, and everything runs offline by default.

Gemma 4 track: say that Gemma 4 is the judge, scoring blind against a rubric with structured output, and that the audit measures how reliable that judging is. If the Gemini API judge provider was built, mention it. If it was not, do not claim it.

## 6. Last checks (15 minutes before the deadline)
- Repo public, link opens in a private window
- Submission form fields filled, demo link or video attached if requested
- A run on the demo machine finishes while on the venue wifi, since only Ollama on localhost is needed
- Laptop charged and plugged in, Ollama running with the settings from `setup_infra`

## Done when
- The submission is sent and the repo link works for someone who is not logged in
