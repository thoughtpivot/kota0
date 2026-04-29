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
// Hello world starter — iterate in AI or edit in Code.
// Icons: Lucide; Heroicons (@heroicons/vue/…); Phosphor (@phosphor-icons/vue); or Iconify ~icons/{collection}/{icon-id} (unplugin-icons).
// Styling: Tailwind + DaisyUI classes (btn, card, …); reka-ui / Headless UI as needed.
</script>

<template>
  <div class="kota0-root flex min-h-full items-center justify-center p-6 text-neutral-800 dark:text-neutral-100">
    <p class="text-lg font-medium tracking-tight">Hello, Kota0</p>
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
  await writeFileIfChanged(path.resolve(MATERIALIZED_APP_VUE), source);
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

