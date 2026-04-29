/**
 * Canonical on-disk Kota0 preview artifacts: `App.vue` + per-app Koa `App.backend.ts`.
 * Scribe holds truth; these files mirror the active app head only.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Monorepo root: **K0_REPO_ROOT** or **REPO_ROOT** if set, else five levels up from this file
 * (viewer → … → repo where `package.json` lives), else `process.cwd()`.
 */
export function resolveKota0RepoRoot(): string {
  const o = process.env.K0_REPO_ROOT?.trim() || process.env.REPO_ROOT?.trim();
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
  resolveKota0RepoRoot(),
  "app",
  "src",
  "components",
  "kota0",
  "viewer",
  "generated",
);
export const MATERIALIZED_APP_VUE = path.join(GENERATED_DIR, "App.vue");
export const MATERIALIZED_APP_BACKEND = path.join(GENERATED_DIR, "App.backend.ts");
/** Pre-rename filename; removed on materialize so Flight does not load two per-app backends. */
const LEGACY_MATERIALIZED_APP_BACKEND = path.join(GENERATED_DIR, "app.backend.ts");

const MATERIALIZED_ALLOWLIST = [path.resolve(MATERIALIZED_APP_VUE), path.resolve(MATERIALIZED_APP_BACKEND)];

export const DEFAULT_K0_SFC = `<script setup lang="ts">
import { ref, onMounted } from "vue";
import { bundleApiUrl } from "./src/bundleApi";

// Hello world starter — iterate in AI or edit in Code.
// Call bundle Flight APIs with bundleApiUrl('api/…') — not fetch('/api/…') — so workspace Preview hits port 4000.
const backendMessage = ref<string | null>(null);

onMounted(async () => {
  try {
    const r = await fetch(bundleApiUrl("api/kota0-app/hello"));
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
    class="kota0-root flex min-h-full flex-col items-center justify-center gap-3 p-6 text-neutral-800 dark:text-neutral-100"
  >
    <p class="text-lg font-medium tracking-tight">Hello, Kota0</p>
    <p v-if="backendMessage !== null" class="max-w-md text-center text-sm text-neutral-600 dark:text-neutral-400">
      Backend: {{ backendMessage }}
    </p>
  </div>
</template>

<style scoped>
.kota0-root {
  font-family: ui-sans-serif, system-ui, sans-serif;
}
</style>
`;

/** Safe default for Flight-loaded `App.backend.ts`: routes under `/api/kota0-app/*`, not core `/api/kota0/*`. */
export const DEFAULT_K0_BACKEND = `import Router, { type RouterContext } from "@koa/router";

const router = new Router();
router.get(["/api/kota0-app/hello", "/kota0-app/hello"], async (ctx: RouterContext) => {
  ctx.status = 200;
  ctx.set("Content-Type", "application/json; charset=utf-8");
  ctx.body = { ok: true, message: "Hello from Kota0 app backend" };
});

export default router.routes();
`;

/**
 * Path-absolute URLs (`/api/kota0-app/…`) ignore `<base href>` in the workspace Preview iframe, so requests hit the
 * platform `/api` proxy instead of bundle Flight on :4000. Rewrite to `bundleApiUrl('api/kota0-app/…')` at materialize time.
 */
export function normalizeKota0AppVueLeadingSlashApis(source: string): string {
  let s = source;
  const leadingKota0Api = /(['"])\/api\/kota0-app\/([^'"]+)\1/g;
  if (!leadingKota0Api.test(s)) return source;
  leadingKota0Api.lastIndex = 0;
  s = s.replace(leadingKota0Api, "bundleApiUrl('api/kota0-app/$2')");
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
 * {@link kota0BundleApiUrl} so the workspace Preview resolves APIs under `/__kota0_bundle/` — otherwise `new URL('api/…', document.baseURI)`
 * can become `/api/…` at the origin root, match Vite's `/api` proxy, get rewritten to `/kota0-app/…`, and 404 on platform Flight.
 */
export function adaptKota0SourceForViewerMirror(source: string): string {
  let s = source;
  s = s.replace(/^import\s+\{\s*bundleApiUrl\s*\}\s+from\s+['"]\.\/src\/bundleApi['"];\s*\r?\n?/m, "");
  s = s.replace(/bundleApiUrl\(\s*'([^']*)'\s*\)/g, "kota0BundleApiUrl('$1')");
  s = s.replace(/bundleApiUrl\(\s*"([^"]*)"\s*\)/g, 'kota0BundleApiUrl("$1")');
  s = s.replace(
    /axios\.get\(\s*new URL\(\s*'([^']*)'\s*,\s*document\.baseURI\s*\)\.href\s*\)/g,
    "axios.get(kota0BundleApiUrl('$1'))",
  );
  s = s.replace(
    /axios\.get\(\s*new URL\(\s*"([^"]*)"\s*,\s*document\.baseURI\s*\)\.href\s*\)/g,
    'axios.get(kota0BundleApiUrl("$1"))',
  );
  if (s.includes("kota0BundleApiUrl(") && !s.includes("@/components/kota0/viewer/kota0BundleApiUrl")) {
    s = s.replace(
      /<script setup lang="ts">\s*\n/,
      `<script setup lang="ts">\nimport { kota0BundleApiUrl } from "@/components/kota0/viewer/kota0BundleApiUrl";\n`,
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
 * Mirror active app `App.vue` under `viewer/generated/` so workspace `kota0-preview` / tooling stay consistent.
 * User apps run from `bundles/<appId>/`; **`App.backend.ts` must not** live here or platform Flight loads duplicate routes.
 */
export async function mirrorKota0GeneratedAppVue(source: string): Promise<void> {
  await writeFileIfChanged(path.resolve(MATERIALIZED_APP_VUE), adaptKota0SourceForViewerMirror(source));
}

/** Remove `viewer/generated/App.backend.ts` so only the bundle Flight on port 4000 registers per-app APIs. */
export async function unlinkKota0GeneratedAppBackend(): Promise<void> {
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

