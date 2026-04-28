---
name: nVibe SBT workspace refactor
overview: "Full alignment with Subject-Based Thinking and Simple Architecture: relocate home to components/home/Home.vue, extract useNvibeWorkspaceChrome and useNvibeAiPanelResize (and optional useNvibeAppQueryParam) from nvibe.vue, add shared NvibeAppStatusBadge + nvibeAppFormat, optional NvibeWorkspaceLayout with slots, update README/imports. No home vs rail variant mega-component."
todos:
  - id: composables-chrome
    content: "Add useNvibeWorkspaceChrome (rail+AI open, sessionStorage keys+watch) under apps/ or new workspace/; wire nvibe.vue"
  - id: composable-resize
    content: "Add useNvibeAiPanelResize (width ref, clamp, pointer+RAF, persist); wire nvibe.vue; drop duplicated locals"
  - id: composable-deeplink
    content: "Add useNvibeAppQueryParam(router,route,apps,selectApp,ensureLoaded) for ?app= after ensureAtLeastOneApp; nvibe onMounted"
  - id: dry-format-badge
    content: "Add apps/nvibeAppFormat.ts (formatUpdatedAt) + apps/NvibeAppStatusBadge.vue; use in Home + any table row"
  - id: layout-slot
    content: "Add nvibe/NvibeWorkspaceLayout.vue (3 slots rail/ai/viewer, binds grid var); slim nvibe.vue template"
  - id: home-subject-move
    content: "Move app/src/views/HomeView.vue → app/src/components/home/Home.vue; router + imports; delete views file"
  - id: verify-docs
    content: "Grep for HomeView path; update README if it lists views/Home; npm run typecheck"
---

# nVibe + home: SBT and Simple Architecture (full recommendations)

## Goals (from analysis)

- **SBT:** Treat **home** as a first-class **subject** alongside `components/nvibe/`, not `views/`.
- **SAP:** Shrink the **orchestrating** [`nvibe.vue`](../app/src/components/nvibe/nvibe.vue) by **composables** (layout persistence + AI resize + optional query sync); keep **visible boundaries** (props/emits) on `NvibeShell`, `NvibeAppsRail`, `NvibeAiDock`, `NvibeWorkspaceViewer`.
- **DRY (bounded):** Shared **status** display and **date** formatting for the home app table; **do not** add `variant=home|rail` mega-list.
- **Optional layout:** A thin **slot** wrapper for the three-column grid so `nvibe.vue` is mostly import + wire.

## Current anchors

- [`nvibe.vue`](../app/src/components/nvibe/nvibe.vue) (~425 lines) owns: icon map, `useNvibeApps`, `useNvibeGeneratedApp`, `sessionStorage` for rail/AI, AI panel **width** + **pointer drag** (long block), `nvibeMdGridTemplate` computed, app row edit handlers, `goHome`, **`?app=`** handling in `onMounted`.
- [`HomeView.vue`](../app/src/views/HomeView.vue) owns landing copy + `fetchNvibeApps` (no `useNvibeApps` on purpose).

## Phase A — Composables (no route rename yet)

### 1. `useNvibeWorkspaceChrome` (name flexible: `useNvibeLayoutPersistence.ts`)

- **Location:** e.g. [`app/src/components/nvibe/apps/useNvibeWorkspaceChrome.ts`](../app/src/components/nvibe/apps/) (or `nvibe/workspace/` if you prefer a neutral subfolder; **one file only** to start).
- **Responsibility:** Current constants `RAIL_OPEN_KEY`, `AI_PANEL_OPEN_KEY`, `read*`, `persist*`, `ref` + `watch` for `appRailOpen` and `aiPanelOpen` (default `true` each per existing behavior).
- **Return:** `{ appRailOpen, aiPanelOpen, toggleAppRail, toggleAiPanel, ... }` or mirror existing parent function names to minimize template churn.

### 2. `useNvibeAiPanelResize`

- **Location:** same subject folder, e.g. `useNvibeAiPanelResize.ts`.
- **Responsibility:** `DEFAULT_` / `MIN_` / `MAX_` / `AI_PANEL_WIDTH_PX_KEY`, `aiPanelMaxPx` ref, `nudge`, `reset`, and **all** pointer/RAF/cancel drag logic + `document.body` cursor styles, matching current [`nvibe.vue`](../app/src/components/nvibe/nvibe.vue) behavior.
- **Return:** `{ aiPanelMaxPx, aiGridTrack, onPanelResizePointerDown, onPanelResizePointerMove, onPanelResizePointerUp, onPanelResizePointerCancel, nudgePanelWidth, resetPanelWidth }` (names aligned with emits to `NvibeAiDock`).

### 3. `useNvibeAppQueryParam` (small)

- **Responsibility:** After apps are loaded (`ensureAtLeastOneApp` resolved), read `route.query.app`, if string matches `app_id` in `apps`, call `selectApp`; if `app` was present in query, `router.replace({ name: "nvibe", query: {} })`. Keeps `onMounted` in `nvibe.vue` to one or two lines.

### 4. Refactor `nvibe.vue`

- Replace inlined blocks with the three composables; keep: heroicons map, `resolvedNvibeAppIconId` / `nvibeAppRowIcon`, `useNvibeApps` / `useNvibeGeneratedApp`, `nvibeMdGridTemplate` **or** move grid string into layout component (see Phase C).
- **Target:** script block substantially shorter; no behavior change.

## Phase B — DRY status + time (under `apps/`)

### 5. `nvibeAppFormat.ts`

- `formatNvibeAppUpdatedAt(iso: string | null): string` — same rules as [HomeView `formatUpdatedAt`](../app/src/views/HomeView.vue) today.

### 6. `NvibeAppStatusBadge.vue`

- **Props:** `status: NvibeAppStatus` (or `string` + narrow in component).
- **Role:** presentational; Tailwind class map for `draft` / `active` / `applied` / `error` in **one** place.
- **Use in:** [HomeView/Home.vue](../app/src/views/HomeView.vue) app table; optional future reuse (rail does not need it if status not shown there).

**Avoid:** forcing `NvibeAppsRail` to adopt the badge unless product wants status on rail—**optional** in this plan.

## Phase C — Optional `NvibeWorkspaceLayout.vue` (if template still heavy)

- **File:** [`app/src/components/nvibe/NvibeWorkspaceLayout.vue`](../app/src/components/nvibe/NvibeWorkspaceLayout.vue).
- **API:** `defineProps` for the CSS var payload (e.g. `gridTemplate: string` or set `--nvibe-md-cols` on root). **Slots:** `rail`, `ai`, `viewer` (or `default` for center—prefer explicit names to match `nvibe-workspace-grid`).
- **`nvibe.vue`:** Replace the single large `div.nvibe-workspace-grid` + three children with this wrapper; no business logic inside layout.

**Skip** if after Phase A the template is already acceptable; the plan can complete without Phase C if line count and readability are good.

## Phase D — Home subject (SBT)

### 7. Relocate home

- **Create** [`app/src/components/home/Home.vue`](../app/src/components/home/Home.vue) — **move** content from [`app/src/views/HomeView.vue`](../app/src/views/HomeView.vue) (adjust imports: logos may use `@/...` or shorter relative from `components/home` to `branding/`).
- **Update** [`app/src/router/index.ts`](../app/src/router/index.ts): `import Home from "@/components/home/Home.vue"`, route `home` unchanged.
- **Delete** `app/src/views/HomeView.vue`.
- **Grep** `HomeView` / `views/Home` and fix docs ([`README.md`](../README.md) if it names the file).

### 8. Wire DRY in home

- Import `NvibeAppStatusBadge` + `formatNvibeAppUpdatedAt` in `Home.vue` after they exist.

## What we explicitly avoid

- One **list** component with `mode="landing|workspace"`.
- Moving **all** of `useNvibeApps` into home (home stays **read-only** list via `fetchNvibeApps` or a thin `useHomeWorkspaceApps` that only lists—only if you want a named composable; default: keep `fetch` in `Home.vue` to avoid session coupling).

## Verification

- `npm run typecheck`
- Manual: `/` rail/AI toggles + persisted reload; AI panel **resize** + **reset**; `/?app=<id>` from home row; `/home` unchanged UX with badge + dates.

## File checklist (add / change / remove)

| Action | Path |
| --- | --- |
| Add | `app/src/components/nvibe/apps/useNvibeWorkspaceChrome.ts` (or chosen path) |
| Add | `app/src/components/nvibe/apps/useNvibeAiPanelResize.ts` |
| Add | `app/src/components/nvibe/apps/useNvibeAppQueryParam.ts` (or co-locate in a tiny `useNvibeRouterSync.ts`) |
| Add | `app/src/components/nvibe/apps/nvibeAppFormat.ts` |
| Add | `app/src/components/nvibe/apps/NvibeAppStatusBadge.vue` |
| Add (optional) | `app/src/components/nvibe/NvibeWorkspaceLayout.vue` |
| Move | `views/HomeView.vue` → `components/home/Home.vue` |
| Edit | `nvibe.vue` |
| Edit | `app/src/router/index.ts` |
| Remove | `app/src/views/HomeView.vue` (after move) |
| Maybe edit | `README.md` |

## Suggested implementation order

1. Composables (A) + `nvibe.vue` refactor — **behavior-only** change; easy to test.
2. DRY (B) + use in home file **before** path move, or **immediately** after `Home.vue` is created in the same PR.
3. `NvibeWorkspaceLayout` (C) if needed.
4. Home move (D) + doc grep.

This order keeps git diffs reviewable: composables first, then UI atoms, then file move.
