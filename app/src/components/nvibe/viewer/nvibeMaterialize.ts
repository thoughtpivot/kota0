/**
 * Canonical on-disk nVibe preview artifacts: `App.vue` + per-app Koa `App.backend.ts`.
 * Scribe holds truth; these files mirror the active app head only.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Monorepo root: **NVIBE_REPO_ROOT** or **REPO_ROOT** if set, else five levels up from this file
 * (viewer → … → repo where `package.json` lives), else `process.cwd()`.
 */
export function resolveNvibeRepoRoot(): string {
  const o = process.env.NVIBE_REPO_ROOT?.trim() || process.env.REPO_ROOT?.trim();
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
  resolveNvibeRepoRoot(),
  "app",
  "src",
  "components",
  "nvibe",
  "viewer",
  "generated",
);
export const MATERIALIZED_APP_VUE = path.join(GENERATED_DIR, "App.vue");
export const MATERIALIZED_APP_BACKEND = path.join(GENERATED_DIR, "App.backend.ts");
/** Pre-rename filename; removed on materialize so Flight does not load two per-app backends. */
const LEGACY_MATERIALIZED_APP_BACKEND = path.join(GENERATED_DIR, "app.backend.ts");

const MATERIALIZED_ALLOWLIST = [path.resolve(MATERIALIZED_APP_VUE), path.resolve(MATERIALIZED_APP_BACKEND)];

export const DEFAULT_NVIBE_SFC = `<script setup lang="ts">
import { ref, onMounted } from "vue";
import { bundleApiUrl } from "./src/bundleApi";

// Hello world starter — iterate in AI or edit in Code.
// Call bundle Flight APIs with bundleApiUrl('api/…') — not fetch('/api/…') — so workspace Preview hits port 4000.
const backendMessage = ref<string | null>(null);

onMounted(async () => {
  try {
    const r = await fetch(bundleApiUrl("api/nvibe-app/hello"));
    if (!r.ok) {
      backendMessage.value = "HTTP " + String(r.status);
      return;
    }
    const data = (await r.json()) as { message?: string };
    backendMessage.value = data.message ?? JSON.stringify(data);
  } catch {
    backendMessage.value = "(fetch failed)";
  }
});
</script>

<template>
  <div
    class="nvibe-root flex min-h-full flex-col items-center justify-center gap-3 p-6 text-neutral-800 dark:text-neutral-100"
  >
    <p class="text-lg font-medium tracking-tight">Hello, nVibe</p>
    <p v-if="backendMessage !== null" class="max-w-md text-center text-sm text-neutral-600 dark:text-neutral-400">
      Backend: {{ backendMessage }}
    </p>
  </div>
</template>

<style scoped>
.nvibe-root {
  font-family: ui-sans-serif, system-ui, sans-serif;
}
</style>
`;

/** Safe default for Flight-loaded `App.backend.ts`: routes under `/api/nvibe-app/*`, not core `/api/nvibe/*`. */
export const DEFAULT_NVIBE_BACKEND = `import Router, { type RouterContext } from "@koa/router";

const router = new Router();
router.get(["/api/nvibe-app/hello", "/nvibe-app/hello"], async (ctx: RouterContext) => {
  ctx.status = 200;
  ctx.set("Content-Type", "application/json; charset=utf-8");
  ctx.body = { ok: true, message: "Hello from nVibe app backend" };
});

export default router.routes();
`;

/**
 * Path-absolute URLs (`/api/nvibe-app/…`) ignore `<base href>` in the workspace Preview iframe, so requests hit the
 * platform `/api` proxy instead of bundle Flight on :4000. Rewrite to `bundleApiUrl('api/nvibe-app/…')` at materialize time.
 */
export function normalizeNvibeAppVueLeadingSlashApis(source: string): string {
  let s = source;
  const leadingNvibeApi = /(['"])\/api\/nvibe-app\/([^'"]+)\1/g;
  if (!leadingNvibeApi.test(s)) return source;
  leadingNvibeApi.lastIndex = 0;
  s = s.replace(leadingNvibeApi, "bundleApiUrl('api/nvibe-app/$2')");
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
 * {@link nvibeBundleApiUrl} so the workspace Preview resolves APIs under `/__nvibe_bundle/` — otherwise `new URL('api/…', document.baseURI)`
 * can become `/api/…` at the origin root, match Vite's `/api` proxy, get rewritten to `/nvibe-app/…`, and 404 on platform Flight.
 */
export function adaptNvibeSourceForViewerMirror(source: string): string {
  let s = source;
  s = s.replace(/^import\s+\{\s*bundleApiUrl\s*\}\s+from\s+['"]\.\/src\/bundleApi['"];\s*\r?\n?/m, "");
  s = s.replace(/bundleApiUrl\(\s*'([^']*)'\s*\)/g, "nvibeBundleApiUrl('$1')");
  s = s.replace(/bundleApiUrl\(\s*"([^"]*)"\s*\)/g, 'nvibeBundleApiUrl("$1")');
  s = s.replace(
    /axios\.get\(\s*new URL\(\s*'([^']*)'\s*,\s*document\.baseURI\s*\)\.href\s*\)/g,
    "axios.get(nvibeBundleApiUrl('$1'))",
  );
  s = s.replace(
    /axios\.get\(\s*new URL\(\s*"([^"]*)"\s*,\s*document\.baseURI\s*\)\.href\s*\)/g,
    'axios.get(nvibeBundleApiUrl("$1"))',
  );
  if (s.includes("nvibeBundleApiUrl(") && !s.includes("@/components/nvibe/viewer/nvibeBundleApiUrl")) {
    s = s.replace(
      /<script setup lang="ts">\s*\n/,
      `<script setup lang="ts">\nimport { nvibeBundleApiUrl } from "@/components/nvibe/viewer/nvibeBundleApiUrl";\n`,
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
 * Mirror active app `App.vue` under `viewer/generated/` so workspace `nvibe-preview` / tooling stay consistent.
 * User apps run from `bundles/<appId>/`; **`App.backend.ts` must not** live here or platform Flight loads duplicate routes.
 */
export async function mirrorNvibeGeneratedAppVue(source: string): Promise<void> {
  await writeFileIfChanged(path.resolve(MATERIALIZED_APP_VUE), adaptNvibeSourceForViewerMirror(source));
}

/** Remove `viewer/generated/App.backend.ts` so only the bundle Flight on port 4000 registers per-app APIs. */
export async function unlinkNvibeGeneratedAppBackend(): Promise<void> {
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

