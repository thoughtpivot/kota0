/**
 * Canonical on-disk PowerVibe preview artifacts: `App.vue` + per-app Koa `App.backend.ts`.
 * Scribe holds truth; these files mirror the active app head only.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Monorepo root: **POWERVIBE_REPO_ROOT** or **REPO_ROOT** if set, else five levels up from this file
 * (viewer → … → repo where `package.json` lives), else `process.cwd()`.
 */
export function resolvePowervibeRepoRoot(): string {
  const o = process.env.POWERVIBE_REPO_ROOT?.trim() || process.env.REPO_ROOT?.trim();
  if (o) return path.resolve(o);
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    dir = path.join(dir, "..");
  }
  const root = path.resolve(dir);
  if (existsSync(path.join(root, "package.json"))) return root;
  return process.cwd();
}

export const GENERATED_DIR = path.join(
  resolvePowervibeRepoRoot(),
  "app",
  "src",
  "components",
  "powervibe",
  "viewer",
  "generated",
);
export const MATERIALIZED_APP_VUE = path.join(GENERATED_DIR, "App.vue");
export const MATERIALIZED_APP_BACKEND = path.join(GENERATED_DIR, "App.backend.ts");
/** Pre-rename filename; removed on materialize so Flight does not load two per-app backends. */
const LEGACY_MATERIALIZED_APP_BACKEND = path.join(GENERATED_DIR, "app.backend.ts");

const MATERIALIZED_ALLOWLIST = [path.resolve(MATERIALIZED_APP_VUE), path.resolve(MATERIALIZED_APP_BACKEND)];

export const DEFAULT_POWERVIBE_SFC = `<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { bundleApiUrl } from "./src/bundleApi";

// Starter demo: rotating hellos from AI + rows in Scribe. Use bundleApiUrl('api/…') — not fetch('/api/…') — in Preview.
const headline = ref("…");
const history = ref<{ id: number; phrase: string }[]>([]);
const tickError = ref<string | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let r = await fetch(url, init);
  if (r.status === 502) {
    await new Promise<void>((fn) => setTimeout(fn, 450));
    r = await fetch(url, init);
  }
  return r;
}

async function loadGreetings(): Promise<void> {
  try {
    const r = await fetchWithRetry(bundleApiUrl("api/powervibe-app/demo-greetings"));
    const text = await r.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      if (!r.ok) {
        tickError.value = "Could not load hellos (HTTP " + String(r.status) + ", non-JSON body).";
      }
      return;
    }
    if (!r.ok) {
      const o = parsed && typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
      const msg = typeof o?.message === "string" ? o.message : "bundle or Scribe unreachable";
      tickError.value = "Could not load earlier hellos: " + msg;
      return;
    }
    const rows = parsed as { id?: unknown; phrase?: unknown }[];
    if (!Array.isArray(rows)) return;
    const mapped = rows
      .map((row) => ({
        id: typeof row.id === "number" ? row.id : Number(row.id),
        phrase: typeof row.phrase === "string" ? row.phrase : "",
      }))
      .filter((x) => Number.isFinite(x.id) && x.phrase.length > 0);
    history.value = mapped;
    if (mapped.length > 0) {
      headline.value = mapped[mapped.length - 1]!.phrase;
    }
    tickError.value = null;
  } catch (e) {
    tickError.value = e instanceof Error ? e.message : "Could not load hellos.";
  }
}

async function tickGreeting(): Promise<void> {
  try {
    const r = await fetchWithRetry(bundleApiUrl("api/powervibe-app/demo-greetings/tick"), { method: "POST" });
    const text = await r.text();
    let data: { ok?: unknown; phrase?: unknown; message?: unknown };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      tickError.value = "New hello tick returned non-JSON (HTTP " + String(r.status) + ").";
      return;
    }
    if (!r.ok) {
      const msg = typeof data.message === "string" ? data.message : "HTTP " + String(r.status);
      tickError.value = "Could not mint a new hello: " + msg;
      return;
    }
    if (typeof data.phrase === "string" && data.phrase.trim()) {
      tickError.value = null;
      headline.value = data.phrase.trim();
      await loadGreetings();
    }
  } catch (e) {
    tickError.value = e instanceof Error ? e.message : "(tick failed)";
  }
}

onMounted(async () => {
  await loadGreetings();
  await tickGreeting();
  pollTimer = setInterval(() => {
    void tickGreeting();
  }, 3000);
});

onUnmounted(() => {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});
</script>

<template>
  <div
    class="powervibe-root flex min-h-full flex-col items-center justify-center gap-5 p-6 text-neutral-800 dark:text-neutral-100"
  >
    <p class="max-w-lg text-center text-2xl font-semibold tracking-tight md:text-3xl">{{ headline }}</p>
    <p class="max-w-md text-center text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
      Turn me into whatever you want — I've got AI and a database wired up already. Hop in the chat and let's get
      started — polished, silly, or somewhere in between.
    </p>
    <p v-if="tickError !== null" class="max-w-md text-center text-xs text-amber-700 dark:text-amber-400" role="alert">
      {{ tickError }}
    </p>
    <div v-if="history.length > 0" class="mt-1 w-full max-w-md">
      <p class="mb-2 text-center text-xs text-neutral-500">Earlier hellos</p>
      <ul
        class="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        <li v-for="row in history" :key="row.id" class="truncate text-neutral-700 dark:text-neutral-300">
          {{ row.phrase }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.powervibe-root {
  font-family: ui-sans-serif, system-ui, sans-serif;
}
</style>
`;

/** Safe default for Flight-loaded `App.backend.ts`: routes under `/api/powervibe-app/*`, not core `/api/powervibe/*`. */
export const DEFAULT_POWERVIBE_BACKEND = `import Router, { type RouterContext } from "@koa/router";
import { createScribeRestClient } from "@shared/scribeRestClient";
import { registerPowervibeBundleHelloRoute, registerPowervibeBundleAiTestRoute } from "@shared/powervibeBundlePlatformAiRoutes";
import { generatePowervibeDemoGreetingPhrase } from "@shared/powervibeBundleDemoGreeting";

const router = new Router();
const scribe = createScribeRestClient();
const greetings = scribe.forComponent<{ phrase: string }>("powervibe_demo_greetings");

function asGreetingRows(raw: unknown): { id: number; phrase: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { id: number; phrase: string }[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "number" ? r.id : Number(r.id);
    const data =
      r.data && typeof r.data === "object" && !Array.isArray(r.data) ? (r.data as Record<string, unknown>) : null;
    const phrase = typeof data?.phrase === "string" ? data.phrase.trim() : "";
    if (!Number.isFinite(id) || !phrase) continue;
    out.push({ id, phrase });
  }
  out.sort((a, b) => a.id - b.id);
  return out.slice(-20);
}

// __powervibe_bundle_probe_routes_v1
registerPowervibeBundleHelloRoute(router);
registerPowervibeBundleAiTestRoute(router);

router.get("/api/powervibe-app/demo-greetings", async (ctx: RouterContext) => {
  ctx.set("Content-Type", "application/json; charset=utf-8");
  try {
    const rows = asGreetingRows(await greetings.listAll());
    ctx.status = 200;
    ctx.body = rows;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ctx.status = 502;
    ctx.body = { error: "scribe_failed", message };
  }
});

router.post("/api/powervibe-app/demo-greetings/tick", async (ctx: RouterContext) => {
  ctx.set("Content-Type", "application/json; charset=utf-8");
  try {
    const { phrase, source } = await generatePowervibeDemoGreetingPhrase();
    await greetings.create({ phrase });
    ctx.status = 200;
    ctx.body = { ok: true, phrase, source };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ctx.status = 502;
    ctx.body = { ok: false, message };
  }
});

export default router.routes();
`;

/**
 * Path-absolute URLs (`/api/powervibe-app/…`) ignore `<base href>` in the workspace Preview iframe, so requests hit the
 * platform `/api` proxy instead of bundle Flight on :4000. Rewrite to `bundleApiUrl('api/powervibe-app/…')` at materialize time.
 */
export function normalizePowervibeAppVueLeadingSlashApis(source: string): string {
  let s = source;
  /** `@/bundleApi` aliases to `app/src` + `/bundleApi` (ENOENT). Bundle ships `./src/bundleApi.ts`. */
  s = s.replace(/from\s+['"]@\/bundleApi['"]/g, "from './src/bundleApi'");
  const leadingPowervibeApi = /(['"])\/api\/powervibe-app\/([^'"]+)\1/g;
  if (!leadingPowervibeApi.test(s)) return s;
  leadingPowervibeApi.lastIndex = 0;
  s = s.replace(leadingPowervibeApi, "bundleApiUrl('api/powervibe-app/$2')");
  if (s.includes("bundleApiUrl(") && !/from\s+['"]\.\/src\/bundleApi['"]/.test(s)) {
    s = s.replace(
      /<script setup lang="ts">\s*\n/,
      `<script setup lang="ts">\nimport { bundleApiUrl } from './src/bundleApi';\n`,
    );
  }
  return s;
}

/**
 * `viewer/generated/` mirrors bundle `App.vue` without `./src/bundleApi`. Swap `bundleApiUrl` for
 * {@link powervibeBundleApiUrl} so the workspace Preview resolves APIs under `/__powervibe_bundle/` — otherwise `new URL('api/…', document.baseURI)`
 * can become `/api/…` at the origin root, match Vite's `/api` proxy, get rewritten to `/powervibe-app/…`, and 404 on platform Flight.
 */
export function adaptPowervibeSourceForViewerMirror(source: string): string {
  let s = source;
  s = s.replace(/^import\s+\{\s*bundleApiUrl\s*\}\s+from\s+['"]\.\/src\/bundleApi['"];\s*\r?\n?/m, "");
  s = s.replace(/^import\s+\{\s*bundleApiUrl\s*\}\s+from\s+['"]@\/bundleApi['"];\s*\r?\n?/m, "");
  s = s.replace(/bundleApiUrl\(\s*'([^']*)'\s*\)/g, "powervibeBundleApiUrl('$1')");
  s = s.replace(/bundleApiUrl\(\s*"([^"]*)"\s*\)/g, 'powervibeBundleApiUrl("$1")');
  s = s.replace(
    /axios\.get\(\s*new URL\(\s*'([^']*)'\s*,\s*document\.baseURI\s*\)\.href\s*\)/g,
    "axios.get(powervibeBundleApiUrl('$1'))",
  );
  s = s.replace(
    /axios\.get\(\s*new URL\(\s*"([^"]*)"\s*,\s*document\.baseURI\s*\)\.href\s*\)/g,
    'axios.get(powervibeBundleApiUrl("$1"))',
  );
  if (s.includes("powervibeBundleApiUrl(") && !s.includes("@/components/powervibe/viewer/powervibeBundleApiUrl")) {
    s = s.replace(
      /<script setup lang="ts">\s*\n/,
      `<script setup lang="ts">\nimport { powervibeBundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";\n`,
    );
  }
  return s;
}

export function assertMaterializedPathAllowlisted(resolvedPath: string): void {
  const normalized = path.normalize(path.resolve(resolvedPath));
  if (!MATERIALIZED_ALLOWLIST.includes(normalized)) {
    throw new Error("path_not_allowlisted");
  }
}

async function writeFileIfChanged(resolved: string, next: string): Promise<void> {
  assertMaterializedPathAllowlisted(resolved);
  await mkdir(GENERATED_DIR, { recursive: true });
  try {
    const current = await readFile(resolved, "utf8");
    if (current === next) return;
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") throw e;
  }
  await writeFile(resolved, next, "utf8");
}

/**
 * Mirror active app `App.vue` under `viewer/generated/` so workspace `powervibe-preview` / tooling stay consistent.
 * User apps run from `bundles/<appId>/`; **`App.backend.ts` must not** live here or platform Flight loads duplicate routes.
 */
export async function mirrorPowervibeGeneratedAppVue(source: string): Promise<void> {
  await writeFileIfChanged(path.resolve(MATERIALIZED_APP_VUE), adaptPowervibeSourceForViewerMirror(source));
}

/** Remove `viewer/generated/App.backend.ts` so only the bundle Flight on port 4000 registers per-app APIs. */
export async function unlinkPowervibeGeneratedAppBackend(): Promise<void> {
  try {
    await unlink(path.resolve(MATERIALIZED_APP_BACKEND));
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") throw e;
  }
  try {
    await unlink(LEGACY_MATERIALIZED_APP_BACKEND);
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") throw e;
  }
}

