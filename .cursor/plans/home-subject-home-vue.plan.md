---
name: Home subject Home.vue
overview: "Landing as a subject capsule: app/src/components/home/Home.vue as orchestrator (like nvibe.vue), not views/HomeView.vue. Minimal nCircle-branded one-pager, Scribe app list, optional ?app= to nVibe, SBT-consistent. No kitchen-sink UI or runtime Gemini."
todos:
  - id: home-subject-scaffold
    content: "Add components/home/Home.vue (optional useHomeWorkspace.ts); delete views/HomeView.vue; router → Home.vue"
  - id: home-apps-fetch
    content: "fetchNvibeApps on mount; count + simple list; loading/error/empty; link with ?app="
  - id: nvibe-query-app
    content: "nvibe.vue: select route.query.app after load; replace to clear query"
  - id: sbt-sanity
    content: "No extra subcomponents unless Home.vue bloats; avoid decorative asset sprawl"
---

# Home landing (subject-based, `Home.vue`)

## Intent

- Follow [Subject-Based Thinking](.cursor/rules/subject-based-thinking.mdc): **home** is a subject; route points at **`@/components/home/Home.vue`**, the same “orchestrator in the subject folder” pattern as [`nvibe.vue`](../app/src/components/nvibe/nvibe.vue), **not** `app/src/views/HomeView.vue`.
- **Recenter scope:** calm, minimal—nCircle blue/white ([tokens](../branding/tokens/tokens.css), [horz-light.svg](../branding/logos/horz-light.svg)), one hero, one apps block, short value line or three small blurbs. No “crazy” multi-section marketing pages.
- **Rename:** `Home.vue` is the name; remove `HomeView` from the tree once migrated.

## Subject layout (lean)

```text
app/src/components/home/
  Home.vue                 # orchestrator: sections, CTAs, onMounted fetch
  useHomeWorkspace.ts     # optional: refs + load() around fetchNvibeApps
```

Reuse [`fetchNvibeApps`](../app/src/components/nvibe/apps/nvibeAppApi.ts) and types from nVibe—no new API.

## Router

- [`app/src/router/index.ts`](../app/src/router/index.ts): `import Home from "@/components/home/Home.vue"`, route `home` → `Home`.

## Deep link to nVibe

- From home: `router.push({ name: "nvibe", query: { app: id } })`.
- [`nvibe.vue`](../app/src/components/nvibe/nvibe.vue): after `ensureAtLeastOneApp`, if `query.app` matches a known app, `selectApp` + `replace` to drop query.

## Copy (short)

- Tight lines only: AEC + vibe-coding, disciplined AI delivery, stack hint (12-factor, Flight, Scribe/Postgres) in a **single row of three** or one short paragraph—per earlier fused positioning, not pasted verbatim.

## Out of scope

- Runtime LLM for the page, heavy branding/patterns unless needed for one subtle hero treatment.

## Verification

- `npm run typecheck`; manual `/home` + workspace + `?app=`.
