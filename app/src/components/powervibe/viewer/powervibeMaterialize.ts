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
import { ref, onMounted } from "vue";
import { bundleApiUrl } from "./src/bundleApi";

// Hello world starter — iterate in AI or edit in Code.
// Call bundle Flight APIs with bundleApiUrl('api/…') — not fetch('/api/…') — so workspace Preview hits port 4000.
const backendMessage = ref<string | null>(null);

async function fetchHelloOnce(url: string): Promise<Response> {
  let r = await fetch(url);
  if (r.status === 502) {
    await new Promise<void>((fn) => setTimeout(fn, 450));
    r = await fetch(url);
  }
  return r;
}

onMounted(async () => {
  try {
    const r = await fetchHelloOnce(bundleApiUrl("api/powervibe-app/hello"));
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
    class="powervibe-root flex min-h-full flex-col items-center justify-center gap-3 p-6 text-neutral-800 dark:text-neutral-100"
  >
    <p class="text-lg font-medium tracking-tight">Hello, PowerVibe</p>
    <p v-if="backendMessage !== null" class="max-w-md text-center text-sm text-neutral-600 dark:text-neutral-400">
      Backend: {{ backendMessage }}
    </p>
  </div>
</template>

<style scoped>
.powervibe-root {
  font-family: ui-sans-serif, system-ui, sans-serif;
}
</style>
`;

/** Safe default for Flight-loaded `App.backend.ts`: routes under `/api/powervibe-app/*`, not core `/api/powervibe/*`. */
export const DEFAULT_POWERVIBE_BACKEND = `import Router from "@koa/router";
import { registerPowervibeBundleHelloRoute, registerPowervibeBundleAiTestRoute } from "@shared/powervibeBundlePlatformAiRoutes";

const router = new Router();
// __powervibe_bundle_probe_routes_v1
registerPowervibeBundleHelloRoute(router);
registerPowervibeBundleAiTestRoute(router);

export default router.routes();
`;

/** Optional starter: minimal blog UI + Scribe `blog_posts` via `@shared/scribeRestClient`. Pair with bundle Secrets `SCRIBE_URL` (e.g. `http://127.0.0.1:1337`). */
export const POWERVIBE_BLOG_SCRIBE_BACKEND = `import Router, { type RouterContext } from "@koa/router";
import { createScribeRestClient } from "@shared/scribeRestClient";

const router = new Router();
const scribe = createScribeRestClient();
const posts = scribe.forComponent<{ title: string; content: string }>("blog_posts");

router.get("/api/powervibe-app/posts", async (ctx: RouterContext) => {
  ctx.body = await posts.listAll();
});

router.post("/api/powervibe-app/posts", async (ctx: RouterContext) => {
  const body = ctx.request.body as { title?: unknown; content?: unknown } | undefined;
  const title = typeof body?.title === "string" ? body.title : "";
  const content = typeof body?.content === "string" ? body.content : "";
  ctx.body = await posts.create({ title, content });
});

export default router.routes();
`;

export const POWERVIBE_BLOG_SCRIBE_SFC = `<script setup lang="ts">
import { ref, onMounted } from "vue";
import { bundleApiUrl } from "./src/bundleApi";
import { Plus, BookOpen } from "lucide-vue-next";

interface Post {
  id: number;
  data: { title: string; content: string };
}

const posts = ref<Post[]>([]);
const newTitle = ref("");
const newContent = ref("");

async function loadPosts() {
  const r = await fetch(bundleApiUrl("api/powervibe-app/posts"));
  if (!r.ok) return;
  const data = (await r.json()) as unknown;
  posts.value = Array.isArray(data) ? (data as Post[]) : [];
}

async function addPost() {
  if (!newTitle.value.trim() || !newContent.value.trim()) return;
  const res = await fetch(bundleApiUrl("api/powervibe-app/posts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: newTitle.value.trim(), content: newContent.value.trim() }),
  });
  if (!res.ok) return;
  newTitle.value = "";
  newContent.value = "";
  await loadPosts();
}

onMounted(loadPosts);
</script>

<template>
  <div class="min-h-screen bg-neutral-50 p-8 font-sans dark:bg-neutral-950">
    <header class="mx-auto mb-10 flex max-w-4xl items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">Editorial</h1>
        <p class="mt-1 text-sm text-neutral-500">Stored in Scribe — set <code class="rounded bg-neutral-200 px-1 dark:bg-neutral-800">SCRIBE_URL</code> in bundle Secrets.</p>
      </div>
      <BookOpen class="size-8 shrink-0 text-indigo-500" aria-hidden="true" />
    </header>

    <main class="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
      <section class="space-y-4 md:col-span-2">
        <p v-if="posts.length === 0" class="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-neutral-700">
          No posts yet — add one in the sidebar.
        </p>
        <article
          v-for="post in posts"
          :key="post.id"
          class="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 class="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{{ post.data.title }}</h2>
          <p class="mt-2 whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">{{ post.data.content }}</p>
        </article>
      </section>

      <aside class="space-y-4">
        <div class="sticky top-8 rounded-2xl bg-indigo-600 p-6 text-white shadow-lg">
          <h3 class="mb-4 font-semibold">New entry</h3>
          <input
            v-model="newTitle"
            type="text"
            placeholder="Title"
            class="mb-3 w-full rounded-lg border-0 bg-indigo-500 px-3 py-2 text-sm placeholder:text-indigo-200 focus:ring-2 focus:ring-white"
          />
          <textarea
            v-model="newContent"
            placeholder="Write something…"
            rows="6"
            class="mb-4 w-full resize-y rounded-lg border-0 bg-indigo-500 px-3 py-2 text-sm placeholder:text-indigo-200 focus:ring-2 focus:ring-white"
          />
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            @click="addPost"
          >
            <Plus class="size-4" aria-hidden="true" />
            Publish
          </button>
        </div>
      </aside>
    </main>
  </div>
</template>
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

