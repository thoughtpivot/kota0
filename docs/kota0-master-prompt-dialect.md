# Kota0 “master prompt” dialect (maintainer / integration note)

This file is **not** shown in the Kota0 product UI — it documents how to reconcile prompts authored elsewhere (e.g. long Gemini thread specs) with how **`App.vue`** is built here.

External prompts often read like **product specs**: role, palette, narrative beats, chart types, and interactions. The **ideation model** is steered in [`kota0IdeationRun.ts`](../app/src/components/kota0/ai/plan/kota0IdeationRun.ts) to ship **dense, polished** single-file UIs without requiring users to paste a template.

## Charts

| External / Gemini-style wording | In Kota0 `App.vue` |
| --- | --- |
| “Chart.js via CDN”, `<script src="…chart…">` | **Do not** use CDN script tags in the SFC. Use **`vue-chartjs`** wrappers + **`chart.js`** imports (the preview registers Chart.js). Register only the Chart.js features you need, same as any bundled Vue app. |

## Icons

| Brief | Kota0 |
| --- | --- |
| “Raw SVG only” | Inline `<svg>` in the SFC is fine. |
| No preference | Prefer **Lucide**, **Heroicons**, **Phosphor**, or **Iconify** (`~icons/…`) as documented in the Kota0 system rules. |

## Authentication

| External / Gemini-style wording | In Kota0 |
| --- | --- |
| “Add auth”, “login”, “OAuth”, “sessions”, “protect routes”, “passkeys” | There is **no** default auth package in root **`dependencies`** (bundles mirror that list). Keep guidance conceptual or use **only** packages already listed—wire **`App.backend.ts`** + **`App.vue`** accordingly after the user picks an approach. **`@koa/router`:** do **not** use paths like `/api/auth/*` (bare `*`); path-to-regexp v8 needs a **named** wildcard (e.g. `/api/auth/*path`) or **`router.use('/api/auth', …)`**. Avoid empty DB adapter stubs. |

## Data / Scribe

| External / Gemini-style wording | In Kota0 |
| --- | --- |
| “Save to Postgres”, “ORM”, “Prisma”, “SQLite”, “persist todos”, “database CRUD” | Prefer **ThoughtPivot Scribe** **REST** from **`App.backend.ts`** (`fetch`/`axios` to **`process.env.SCRIBE_URL`**); **`App.vue`** calls **`bundleApiUrl('api/kota0-app/…')`** through Koa **proxy** routes. **`SCRIBE_URL`** / **`SCRIBE_*`** come from **bundle Secrets** (merged `.env`). Do **not** use **`@/lib/scribe`** in **`App.backend.ts`** (no `@/` in Flight bundles). **`DATABASE_URL`** is optional when the brief explicitly needs **direct** SQL (e.g. **`pg`**); **domain entities** still default to **Scribe** unless the brief says otherwise. |

## Fonts and color

- Prefer **Tailwind** utilities and fonts already loaded by the shell when they match the story.
- For **story-specific** themes, user-requested **hex** colors (e.g. arbitrary values like `bg-[#020202]` or scoped CSS) in **`App.vue`** are normal for narrative dashboards.
- Avoid many per-app `@import` Google Font lines unless the brief demands a face the app does not already provide; when in doubt, use `font-sans` / `font-mono` from the preview stack.

## Structure and Apply

- One **```vue** fenced block in the model reply = the **full** replacement **`App.vue`** merged from Scribe HEAD, then **Apply** writes it to Scribe.
- A brief that says “under 150 lines” is a **soft** goal: the file must stay **complete and valid** for Vite (template + script + styles as needed), not truncated mid-feature.

## Tailwind / style pitfalls

- In `<style>`, **`@apply`** with **`selection:`** utilities breaks the build — use plain **`::selection { … }`** (see Kota0 rules) or `selection:` classes on template nodes only.
- With **`@apply`**, include **`@reference "../../style.css"`** in that `<style>` block (the model is reminded in system rules).

## Optional env

- **`GEMINI_MODEL`** — stronger models (e.g. Pro-class ids) often help long SFCs; trade cost vs quality.

## Quick checklist before paste

1. Replace “Chart.js CDN” mentally with **vue-chartjs + chart.js imports**.
2. Keep **one** narrative app in **one** SFC; multi-file pipelines are out of scope for stock Kota0.
3. Ask for **scroll sections + named charts + interactions** explicitly — the model follows the brief inside **`App.vue`**.
