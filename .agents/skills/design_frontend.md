---
name: design_frontend
description: Set the visual direction, tokens, layout and component rules for the ModelFit Next.js app before any screen is built.
---

# design_frontend

## Before anything else
Read every taste skill from tasteskill.dev already in `.agents/skills` and the frontend-design guidance. Where they conflict with this file, the taste skills win on craft details and this file wins on product identity. Do the two-pass process: write the plan below into `docs/design.md` in your own words, critique it against the brief, revise, then build.

## Subject and audience
Developers and students who run models locally and need to pick one. The primary job: understand within ten seconds which model to run and whether the judgement behind it is trustworthy.

## Direction: a measurement sheet, not a SaaS dashboard
The product is a bench test. Results should feel measured and plotted, not decorated. Do not use the common generated-page defaults (cream and terracotta, black with acid green, uniform rounded cards with soft shadows, all-caps eyebrow labels, monospace micro-labels, arrows on every link).

### Palette (name and keep these)
- Paper `#EEF1F4` page background
- Ink `#101B33` text and plot lines
- Rule `#C9D0DB` borders and gridlines
- Cobalt `#2748F5` quality and primary actions
- Flare `#F4511E` cost, slowness and distrust
- Moss `#1F7A5A` the good-enough pick and reliable states

Panels sit on a slightly lighter tint of paper `#F7F9FB` and are separated by 1px Rule lines, with no shadows. No gradients.

### Type
One family: Schibsted Grotesk through `next/font/google`, weights 400, 500 and 700, tabular figures enabled for all numbers (`font-variant-numeric: tabular-nums`). Large numerals are set in 700 with tight tracking. Sentence case everywhere. Body line length under 75 characters. Scale: 13, 15, 18, 24, 40, 72.

### Radius and spacing
2px on inputs and buttons, 0 on panels and tables, full pill only for status chips. Spacing steps of 4, 8, 16, 24, 40, 64.

### The memorable element
The efficiency frontier plot. On a finished run it is the first and largest thing on screen, filling the main column, with the good-enough model circled in Moss and labelled directly on the plot. Everything else stays quiet around it. Gridlines are Rule at 0.6 opacity, axes are labelled in plain words (Quality score, Memory in GB), points are labelled by model name directly, with no legend.

### Layout
```
+--------+--------------------------------------------------+
| runs   |  phase line (generating, judging, auditing, done) |
| list   |  big plot                         | verdict panel |
| (240px)|                                   | sliders       |
|        |  tabs: Responses | Judge audit    |               |
+--------+--------------------------------------------------+
```
Left aligned throughout. The left rail is a plain list with the run's first prompt as its title and a status chip. No cards for lists: use ruled rows. Under 900px the rail becomes a top sheet and the verdict panel moves under the plot.

### Motion
One orchestrated moment: when the run reaches `done`, the frontier points ease into position and the good-enough ring draws itself. During a run, rows and cells fill in as events arrive. Respect `prefers-reduced-motion`.

### Copy
Plain verbs and the user's vocabulary. Buttons say `Start benchmark`, `Stop run`, `Download report`. Errors say what failed and what to do, for example `Ollama is not running. Start it with ollama serve, then try again.` Empty states invite action: `Add a few prompts you actually use. Five is enough.` Trust labels reuse the exact audit label strings.

## Technical setup
- shadcn/ui components used: Button, Input, Textarea, Slider, Tabs, Checkbox, Tooltip. Restyle them to the tokens above in `globals.css` using CSS variables
- Strict TypeScript. Types for every API shape in `src/lib/types.ts`, copied from `build_backend`
- `src/lib/api.ts`: typed fetch functions reading `NEXT_PUBLIC_API` (default `http://localhost:8000/api`)
- `src/lib/useRun.ts`: one hook that loads `GET /api/runs/{id}` then opens `EventSource` and merges events into state
- No state library. React state and the hook are enough
- Quality floor: visible focus rings, keyboard reachable tabs and sliders, contrast above 4.5:1, works at 375px wide

## Done when
- `docs/design.md` exists with the revised plan
- Tokens are in `globals.css`, the font loads, and a blank shell with the left rail renders in the right colours
