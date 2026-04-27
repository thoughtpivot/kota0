# nVibe “master prompt” dialect (maintainer / integration note)

This file is **not** shown in the nVibe product UI — it documents how to reconcile prompts authored elsewhere (e.g. long Gemini thread specs) with how **`App.vue`** is built here.

External prompts often read like **product specs**: role, palette, narrative beats, chart types, and interactions. The **ideation model** is steered in [`nvibeIdeationRun.ts`](../app/src/subjects/plan/nvibeIdeationRun.ts) to ship **dense, polished** single-file UIs without requiring users to paste a template.

## Charts

| External / Gemini-style wording | In nVibe `App.vue` |
| --- | --- |
| “Chart.js via CDN”, `<script src="…chart…">` | **Do not** use CDN script tags in the SFC. Use **`vue-chartjs`** wrappers + **`chart.js`** imports (the preview registers Chart.js). Register only the Chart.js features you need, same as any bundled Vue app. |

## Icons

| Brief | nVibe |
| --- | --- |
| “Raw SVG only” | Inline `<svg>` in the SFC is fine. |
| No preference | Prefer **Lucide**, **Heroicons**, **Phosphor**, or **Iconify** (`~icons/…`) as documented in the nVibe system rules. |

## Fonts and color

- Prefer **Tailwind** utilities and fonts already loaded by the shell when they match the story.
- For **story-specific** themes, user-requested **hex** colors (e.g. arbitrary values like `bg-[#020202]` or scoped CSS) in **`App.vue`** are normal for narrative dashboards.
- Avoid many per-app `@import` Google Font lines unless the brief demands a face the app does not already provide; when in doubt, use `font-sans` / `font-mono` from the preview stack.

## Structure and Apply

- One **```vue** fenced block in the model reply = the **full** replacement **`App.vue`** merged from Scribe HEAD, then **Apply** writes it to Scribe.
- A brief that says “under 150 lines” is a **soft** goal: the file must stay **complete and valid** for Vite (template + script + styles as needed), not truncated mid-feature.

## Tailwind / style pitfalls

- In `<style>`, **`@apply`** with **`selection:`** utilities breaks the build — use plain **`::selection { … }`** (see nVibe rules) or `selection:` classes on template nodes only.
- With **`@apply`**, include **`@reference "../../style.css"`** in that `<style>` block (the model is reminded in system rules).

## Optional env

- **`GEMINI_MODEL`** — stronger models (e.g. Pro-class ids) often help long SFCs; trade cost vs quality.

## Quick checklist before paste

1. Replace “Chart.js CDN” mentally with **vue-chartjs + chart.js imports**.
2. Keep **one** narrative app in **one** SFC; multi-file pipelines are out of scope for stock nVibe.
3. Ask for **scroll sections + named charts + interactions** explicitly — the model follows the brief inside **`App.vue`**.
