# ModelFit Design Specification

## Identity and Direction
ModelFit is a bench-test measurement sheet for local LLMs, not a generic SaaS dashboard. Results are plotted and quantified with precision. There are no pastel cards, soft drop-shadows, acid neon accents, or decorative gradients.

## Color System
- Paper: `#EEF1F4` (Page canvas background)
- Paper Light: `#F7F9FB` (Panel backgrounds)
- Ink: `#101B33` (Body text, primary plot marks, titles)
- Rule: `#C9D0DB` (1px structure borders, gridlines, dividers)
- Cobalt: `#2748F5` (Quality metrics, active tabs, primary actions)
- Flare: `#F4511E` (Cost, latency, warnings, low trust)
- Moss: `#1F7A5A` (Good-enough model highlight, high trust, success)

## Typography
- Family: Schibsted Grotesk (Google Fonts via next/font/google)
- Numbers: Tabular figures enabled across all tables, charts, and metric displays (`font-variant-numeric: tabular-nums`)
- Weights: 400 (regular), 500 (medium), 700 (bold numerals and section headers)
- Case: Sentence case everywhere, avoiding artificial uppercase micro-labels

## Layout Geometry
- Sidebar: 240px fixed left rail displaying run history and new run launcher
- Main Work Area:
  - Phase status bar (queued, generating, judging, auditing, done)
  - Frontier efficiency plot taking center stage
  - Right verdict panel with good-enough pick and interactive weight sliders
  - Tabbed lower inspection view: Prompt Responses and Judge Audit Breakdown
- Responsive breakpoint at 900px transitioning sidebar to top sheet

## Components and Borders
- Panels: 0px border-radius, 1px Rule borders, no shadows
- Inputs and Buttons: 2px border-radius
- Status chips: Pill radius with high contrast semantic fills
- Visual Motion: Smooth transitions on data arrival; respects prefers-reduced-motion

## Design Critique and Revision
- Initial pass check: Ensure the frontier chart does not require a secondary legend by placing direct model name annotations next to scatter points.
- Hierarchy check: The good-enough model circled in Moss must be instantly readable within 5 seconds of opening a completed run.
- Accessibility check: All text meets WCAG AA contrast (minimum 4.5:1) against Paper and Paper Light surfaces. Focus rings must be sharply outlined with 2px Cobalt.
