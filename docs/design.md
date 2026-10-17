# ModelFit Design Specification — Phase 7b Visual Redesign

## 1. Concept: The Lab Plotting Sheet
ModelFit is a precision engineering bench test for local LLMs. It adopts the aesthetic of an engineering plotting sheet: high-contrast Ink on Paper, crisp 1px rule lines, graph-paper coordinate backing, tactile step sequencing, and a signature animated Pareto efficiency frontier. There are no soft drop shadows, pastel gradients, or generic SaaS card containers.

## 2. Color System and Palette Tokens
- Paper: `#EEF1F4` (Base page canvas with 24px graph-paper grid backing)
- Panel: `#F9FAFC` (Structured content blocks, 1px border, 0px radius)
- Ink: `#101B33` (Headings, primary body text, plot marks, dark rail)
- Ink Raised: `#1B2A4D` (Selected navigation row on the left rail)
- Rule: `#C9D0DB` (1px structure dividers, borders, chart axes)
- Cobalt: `#2748F5` (Primary accents, step numerals, active states, buttons)
- Cobalt Tint: `#DCE3FF` (Selected candidate model row fill)
- Moss: `#1F7A5A` (Good-enough model highlight, high trust, finished phases)
- Moss Tint: `#D7EEE4` (Good-enough callout badges)
- Flare: `#F4511E` (Low trust, latency warnings, validation errors)
- Flare Tint: `#FFE3D9` (Memory warnings and error callouts)

## 3. Typography & Spacing Rules
- Font Family: Schibsted Grotesk across all elements.
- Punctuation Fix: Remove global `tabular-nums` from `body`. Scope `font-variant-numeric: tabular-nums` strictly to the `.num` class (timings, TPS, memory, scores, percentages, and step numerals).
- Type Scale: 13, 15, 18, 24, 40, 56/72.
- Text Hierarchy: Headings 700 with tight tracking (-0.02em); body 400 (line-length < 75ch); labels 500; large step numerals 40px Cobalt `.num`.
- Case: Sentence case everywhere. No uppercase micro-eyebrows, no monospace pill meta strings, no button arrows.
- Spacing Scale: 4, 8, 16, 24, 40, 64 only. Max-width of main column is 1120px.

## 4. Layout Architecture
- Left Rail: Fixed 260px wide, solid Ink `#101B33` background with Paper `#EEF1F4` text. Top wordmark with three-step staircase icon. Solid Cobalt full-width "New run" button. Ruled run rows with semantic status dots (Moss done, Cobalt running, Flare failed), run ID in `.num`, and prompt/model count subtitle.
- Graph-Paper Grid Background: Applied to main workspace via CSS linear-gradient grid (24px cells, Rule at 35% opacity).
- New Run Hero: 56px bold headline "Which local model fits your prompts?", 18px single benefit subtitle, and inline SVG miniature frontier chart with an animated Moss "Good enough" circle drawing itself via stroke-dashoffset (900ms ease, respecting prefers-reduced-motion).
- Three-Step Structured Form:
  - Step 1: Prompts — gutter-numbered textareas, three descriptive chip buttons with dual-line text, collapsible "Paste many prompts" disclosure.
  - Step 2: Models — full-width model rows with 500 weight label, proportional size bar in GB, family/quant tag, and Cobalt tint + Cobalt left bar when selected. Count line and memory headroom warning.
  - Step 3: Priorities — custom Cobalt fill sliders with Ink round thumb and `.num` value readout, plus plain-language guidance lines.
- Sticky Action Bar: Bottom pinned within main column, Panel background with top Rule border. Left summary string ("3 models, 5 prompts, about 12 minutes"); right 48px Cobalt "Start benchmark" button with clear disabled reason in Flare.
- Run Page Dashboard:
  - Phase status line: 4 linked steps across top rule (queued, generating, judging, done).
  - 480px full-width frontier scatter plot with graph-paper grid backing, direct Ink labels, Cobalt error bars, and Moss "Good enough" ring.
  - Right verdict panel: 40px model name, 15px plain justification, interactive weight sliders, ruled ranking table without zebra stripes.
  - Underline-style tabs (Prompt responses vs Judge audit).
  - Judge audit breakdown: 72px Trust Score numeral with color-coded confidence tier, followed by 4 ruled diagnostic sections.

## 5. Design Critique & Refinement
- Critique 1 (Generic Form): Standard checkboxes and text inputs felt like an unstyled bootstrap form.
  - Fix: Step numerals (40px Cobalt), full-width selectable rows with active left accent borders, and gutter-numbered prompt fields.
- Critique 2 (Punctuation Spacing): `tabular-nums` on body created artificial gaps before commas and periods.
  - Fix: Confined `tabular-nums` solely to `.num` utility class.
- Critique 3 (Visual Identity): The initial view lacked instant communication of the product's purpose.
  - Fix: Built the hero miniature frontier SVG that animates the "Good enough" ring on load, framing the entire application around the Pareto frontier.
