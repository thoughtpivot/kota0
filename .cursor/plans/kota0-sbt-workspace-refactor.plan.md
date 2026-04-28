---
name: Kota0 SBT workspace refactor
overview: "Full alignment with Subject-Based Thinking and Simple Architecture: relocate home to components/home/Home.vue, extract useKota0WorkspaceChrome and useKota0AiPanelResize (and optional useKota0AppQueryParam) from kota0.vue, add shared Kota0AppStatusBadge + kota0AppFormat, optional Kota0WorkspaceLayout with slots, update README/imports. No home vs rail variant mega-component."
todos:
  - id: composables-chrome
    content: "Add useKota0WorkspaceChrome (rail+AI open, sessionStorage keys+watch) under apps/ or new workspace/; wire kota0.vue"
  - id: composable-resize
    content: "Add useKota0AiPanelResize (width ref, clamp, pointer+RAF, persist); wire kota0.vue; drop duplicated locals"
  - id: composable-deeplink
    content: "Add useKota0AppQueryParam(router,route,apps,selectApp,ensureLoaded) for ?app= after ensureAtLeastOneApp; kota0 onMounted"
  - id: dry-format-badge
    content: "Add apps/kota0AppFormat.ts (formatUpdatedAt) + apps/Kota0AppStatusBadge.vue; use in Home + any table row"
  - id: layout-slot
    content: "Add kota0/Kota0WorkspaceLayout.vue (3 slots rail/ai/viewer, binds grid var); slim kota0.vue template"
  - id: home-subject-move
    content: "Move app/src/views/HomeView.vue → app/src/components/home/Home.vue; router + imports; delete views file"
  - id: verify-docs
    content: "Grep for HomeView path; update README if it lists views/Home; npm run typecheck"
---

# Kota0 + home: SBT and Simple Architecture (full recommendations)

## Goals (from analysis)

- **SBT:** Treat **home** as a first-class **subject** alongside `components/kota0/`, not `views/`.
- **SAP:** Shrink the **orchestrating** [`kota0.vue`](../app/src/components/kota0/kota0.vue) by **composables** (layout persistence + AI resize + optional query sync); keep **visible boundaries** (props/emits) on `Kota0Shell`, `Kota0AppsRail`, `Kota0AiDock`, `Kota0WorkspaceViewer`.
- **DRY (bounded):** Shared **status** display and **date** formatting for the home app table; **do not** add `variant=home|rail` mega-list.
- **Optional layout:** A thin **slot** wrapper for the three-column grid so `kota0.vue` is mostly import + wire.

## Current anchors

- [`kota0.vue`](../app/src/components/kota0/kota0.vue) (~425 lines) owns: icon map, `useKota0Apps`, `useKota0GeneratedApp`, `sessionStorage` for rail/AI, AI panel **width** + **pointer drag** (long block), `kota0MdGridTemplate` computed, app row edit handlers, `goHome`, **`?app=`** handling in `onMounted`.
- [`HomeView.vue`](../app/src/views/HomeView.vue) owns landing copy + `fetchKota0Apps` (no `useKota0Apps` on purpose).

## Phase A — Composables (no route rename yet)

### 1. `useKota0WorkspaceChrome` (name flexible: `useKota0LayoutPersistence.ts`)

- **Location:** e.g. [`app/src/components/kota0/apps/useKota0WorkspaceChrome.ts`](../app/src/components/kota0/apps/) (or `kota0/workspace/` if you prefer a neutral subfolder; **one file only** to start).
- **Responsibility:** Current constants `RAIL_OPEN_KEY`, `AI_PANEL_OPEN_KEY`, `read*`, `persist*`, `ref` + `watch` for `appRailOpen` and `aiPanelOpen` (default `true` each per existing behavior).
- **Return:** `{ appRailOpen, aiPanelOpen, toggleAppRail, toggleAiPanel, ... }` or mirror existing parent function names to minimize template churn.

### 2. `useKota0AiPanelResize`

- **Location:** same subject folder, e.g. `useKota0AiPanelResize.ts`.
- **Responsibility:** `DEFAULT_` / `MIN_` / `MAX_` / `AI_PANEL_WIDTH_PX_KEY`, `aiPanelMaxPx` ref, `nudge`, `reset`, and **all** pointer/RAF/cancel drag logic + `document.body` cursor styles, matching current [`kota0.vue`](../app/src/components/kota0/kota0.vue) behavior.
- **Return:** `{ aiPanelMaxPx, aiGridTrack, onPanelResizePointerDown, onPanelResizePointerMove, onPanelResizePointerUp, onPanelResizePointerCancel, nudgePanelWidth, resetPanelWidth }` (names aligned with emits to `Kota0AiDock`).

### 3. `useKota0AppQueryParam` (small)

- **Responsibility:** After apps are loaded (`ensureAtLeastOneApp` resolved), read `route.query.app`, if string matches `app_id` in `apps`, call `selectApp`; if `app` was present in query, `router.replace({ name: "kota0", query: {} })`. Keeps `onMounted` in `kota0.vue` to one or two lines.

### 4. Refactor `kota0.vue`

- Replace inlined blocks with the three composables; keep: heroicons map, `resolvedKota0AppIconId` / `kota0AppRowIcon`, `useKota0Apps` / `useKota0GeneratedApp`, `kota0MdGridTemplate` **or** move grid string into layout component (see Phase C).
- **Target:** script block substantially shorter; no behavior change.

## Phase B — DRY status + time (under `apps/`)

### 5. `kota0AppFormat.ts`

- `formatKota0AppUpdatedAt(iso: string | null): string` — same rules as [HomeView `formatUpdatedAt`](../app/src/views/HomeView.vue) today.

### 6. `Kota0AppStatusBadge.vue`

- **Props:** `status: Kota0AppStatus` (or `string` + narrow in component).
- **Role:** presentational; Tailwind class map for `draft` / `active` / `applied` / `error` in **one** place.
- **Use in:** [HomeView/Home.vue](../app/src/views/HomeView.vue) app table; optional future reuse (rail does not need it if status not shown there).

**Avoid:** forcing `Kota0AppsRail` to adopt the badge unless product wants status on rail—**optional** in this plan.

## Phase C — Optional `Kota0WorkspaceLayout.vue` (if template still heavy)

- **File:** [`app/src/components/kota0/Kota0WorkspaceLayout.vue`](../app/src/components/kota0/Kota0WorkspaceLayout.vue).
- **API:** `defineProps` for the CSS var payload (e.g. `gridTemplate: string` or set `--kota0-md-cols` on root). **Slots:** `rail`, `ai`, `viewer` (or `default` for center—prefer explicit names to match `kota0-workspace-grid`).
- **`kota0.vue`:** Replace the single large `div.kota0-workspace-grid` + three children with this wrapper; no business logic inside layout.

**Skip** if after Phase A the template is already acceptable; the plan can complete without Phase C if line count and readability are good.

## Phase D — Home subject (SBT)

### 7. Relocate home

- **Create** [`app/src/components/home/Home.vue`](../app/src/components/home/Home.vue) — **move** content from [`app/src/views/HomeView.vue`](../app/src/views/HomeView.vue) (adjust imports: logos may use `@/...` or shorter relative from `components/home` to `branding/`).
- **Update** [`app/src/router/index.ts`](../app/src/router/index.ts): `import Home from "@/components/home/Home.vue"`, route `home` unchanged.
- **Delete** `app/src/views/HomeView.vue`.
- **Grep** `HomeView` / `views/Home` and fix docs ([`README.md`](../README.md) if it names the file).

### 8. Wire DRY in home

- Import `Kota0AppStatusBadge` + `formatKota0AppUpdatedAt` in `Home.vue` after they exist.

## What we explicitly avoid

- One **list** component with `mode="landing|workspace"`.
- Moving **all** of `useKota0Apps` into home (home stays **read-only** list via `fetchKota0Apps` or a thin `useHomeWorkspaceApps` that only lists—only if you want a named composable; default: keep `fetch` in `Home.vue` to avoid session coupling).

## Verification

- `npm run typecheck`
- Manual: `/` rail/AI toggles + persisted reload; AI panel **resize** + **reset**; `/?app=<id>` from home row; `/home` unchanged UX with badge + dates.

## File checklist (add / change / remove)

| Action | Path |
| --- | --- |
| Add | `app/src/components/kota0/apps/useKota0WorkspaceChrome.ts` (or chosen path) |
| Add | `app/src/components/kota0/apps/useKota0AiPanelResize.ts` |
| Add | `app/src/components/kota0/apps/useKota0AppQueryParam.ts` (or co-locate in a tiny `useKota0RouterSync.ts`) |
| Add | `app/src/components/kota0/apps/kota0AppFormat.ts` |
| Add | `app/src/components/kota0/apps/Kota0AppStatusBadge.vue` |
| Add (optional) | `app/src/components/kota0/Kota0WorkspaceLayout.vue` |
| Move | `views/HomeView.vue` → `components/home/Home.vue` |
| Edit | `kota0.vue` |
| Edit | `app/src/router/index.ts` |
| Remove | `app/src/views/HomeView.vue` (after move) |
| Maybe edit | `README.md` |

## Suggested implementation order

1. Composables (A) + `kota0.vue` refactor — **behavior-only** change; easy to test.
2. DRY (B) + use in home file **before** path move, or **immediately** after `Home.vue` is created in the same PR.
3. `Kota0WorkspaceLayout` (C) if needed.
4. Home move (D) + doc grep.

This order keeps git diffs reviewable: composables first, then UI atoms, then file move.
