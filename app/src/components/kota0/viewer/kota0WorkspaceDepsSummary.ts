/**
 * Bounded summary of workspace `dependencies` (+ allowlisted Tailwind/Daisy devDeps) for Kota0 ideation.
 * Categorized so Gemini treats the list as an allowlist (frontend vs backend vs AI).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_MAX_CHARS = 6000;

export function resolveKota0IdeationDepsSummaryMaxChars(): number {
  const raw = process.env.K0_IDEATION_DEPS_SUMMARY_MAX_CHARS?.trim();
  if (!raw) return DEFAULT_MAX_CHARS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 500) return DEFAULT_MAX_CHARS;
  return Math.min(Math.floor(n), 100_000);
}

/** Tailwind + DaisyUI are devDependencies but affect generated `App.vue` styling in preview. */
const K0_DEV_DEP_ALLOWLIST = ["daisyui", "tailwindcss", "unplugin-icons"] as const;

const PREAMBLE =
  "**Capability contract:** Treat packages below as the **allowlist** for what you can recommend or import. " +
  "Do **not** assume new npm packages can be installed inside a user’s bundle—if something is missing, say the **workspace `dependencies`** must change first. " +
  "**`App.vue` (browser):** UI only; use **`fetch(bundleApiUrl('api/kota0-app/…'))`** for data—**never** `SCRIBE_URL`, **`createScribeRestClient`**, or direct HTTP to Scribe from the SFC. " +
  "**`App.backend.ts` (Node / Flight):** Koa routes; **ThoughtPivot Scribe** via **`@shared/scribeRestClient`**; **per-app Redis** via **`@shared/bundleRedisClient`** (`createBundleRedisClient()` — auto-prefixes keys with **`K0_APP_REDIS_PREFIX`**; do **not** import `ioredis` directly); **default LLM:** **`@shared/kota0PlatformAi`** → workspace **`/api/kota0/apps/:appId/ai/complete`** (**`K0_PLATFORM_API_ORIGIN`**, **`K0_APP_ID`**); opt-in **`@google/genai`** + bundle **`GEMINI_*`**; **`@modelcontextprotocol/sdk`** with secrets from bundle **`.env`**.\n\n";

type DepBucket =
  | "frontend"
  | "charts"
  | "editors"
  | "backend"
  | "ai"
  | "mcp"
  | "platform"
  | "other";

const BUCKET_LABEL: Record<DepBucket, string> = {
  frontend: "[Frontend / App.vue — UI, icons, styling helpers]",
  charts: "[Charts — use only when the user asks for dashboards, metrics, trends, or quantitative viz]",
  editors: "[Editors / markdown / highlighting]",
  backend: "[Backend / App.backend.ts — HTTP, DB, cache, validation]",
  ai: "[AI — typically App.backend.ts + bundle secrets, not exposed keys in App.vue]",
  mcp: "[MCP — Node servers from App.backend.ts]",
  platform: "[Platform runtime]",
  other: "[Other production dependencies]",
};

function bucketForDep(name: string): DepBucket {
  if (
    name === "vue" ||
    name === "vue-router" ||
    name === "@vueuse/core" ||
    name === "@headlessui/vue" ||
    name === "reka-ui" ||
    name === "@heroicons/vue" ||
    name === "@phosphor-icons/vue" ||
    name === "lucide-vue-next" ||
    name === "clsx" ||
    name === "tailwind-merge" ||
    name === "class-variance-authority" ||
    name === "dompurify"
  ) {
    return "frontend";
  }
  if (name === "chart.js" || name === "vue-chartjs") return "charts";
  if (
    name === "codemirror" ||
    name === "vue-codemirror" ||
    name.startsWith("@codemirror/") ||
    name === "markdown-it" ||
    name === "@shikijs/markdown-it" ||
    name === "shiki"
  ) {
    return "editors";
  }
  if (
    name === "koa" ||
    name === "@koa/router" ||
    name === "@koa/bodyparser" ||
    name === "axios" ||
    name === "pg" ||
    name === "ioredis" ||
    name === "dotenv" ||
    name === "cheerio" ||
    name === "jsonrepair" ||
    name === "zod"
  ) {
    return "backend";
  }
  if (name === "@google/genai") return "ai";
  if (name === "@modelcontextprotocol/sdk") return "mcp";
  if (name === "@thoughtpivot/flight") return "platform";
  return "other";
}

const BUCKET_ORDER: DepBucket[] = [
  "frontend",
  "charts",
  "editors",
  "backend",
  "ai",
  "mcp",
  "platform",
  "other",
];

function formatDepLine(name: string, range: string): string {
  return `${name}@${range}`;
}

/** Sorted `name@range` from repo-root `package.json` dependencies (categorized), plus allowlisted devDeps (bounded). */
export function getKota0WorkspaceDepsSummary(cwd: string = process.cwd()): string {
  const max = resolveKota0IdeationDepsSummaryMaxChars();
  try {
    const file = path.join(cwd, "package.json");
    const raw = readFileSync(file, "utf8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = pkg.dependencies && typeof pkg.dependencies === "object" ? pkg.dependencies : {};
    const devDeps = pkg.devDependencies && typeof pkg.devDependencies === "object" ? pkg.devDependencies : {};

    const buckets: Record<DepBucket, string[]> = {
      frontend: [],
      charts: [],
      editors: [],
      backend: [],
      ai: [],
      mcp: [],
      platform: [],
      other: [],
    };

    const sortedNames = Object.keys(deps).sort((a, b) => a.localeCompare(b));
    for (const name of sortedNames) {
      const v = deps[name];
      const line = formatDepLine(name, typeof v === "string" ? v : String(v));
      buckets[bucketForDep(name)].push(line);
    }

    const listingParts: string[] = [];
    for (const b of BUCKET_ORDER) {
      const lines = buckets[b];
      if (lines.length === 0) continue;
      listingParts.push(`${BUCKET_LABEL[b]}\n${lines.join("\n")}`);
    }

    const devExtra: string[] = [];
    for (const k of K0_DEV_DEP_ALLOWLIST) {
      const v = devDeps[k];
      if (typeof v === "string" && v.length > 0) {
        const note =
          k === "unplugin-icons" ?
            "devDependency; Iconify `~icons/…` imports in Kota0 preview build"
          : "devDependency; Tailwind/Daisy stack for Kota0 preview";
        devExtra.push(`${k}@${v} (${note})`);
      }
    }

    let listing = listingParts.join("\n\n");
    if (devExtra.length > 0) {
      listing =
        listing.length > 0 ?
          `${listing}\n\n[Styling / icons — allowed exceptions]\n${devExtra.join("\n")}`
        : `[Styling / icons — allowed exceptions]\n${devExtra.join("\n")}`;
    }

    if (listing.length === 0) {
      return PREAMBLE.trimEnd() + "\n\n(no categorized dependencies in package.json)";
    }

    let body = `${PREAMBLE}${listing}`;
    if (body.length > max) {
      const reserve = "\n…(truncated; raise K0_IDEATION_DEPS_SUMMARY_MAX_CHARS if needed)".length;
      const sliceLen = Math.max(0, max - reserve);
      body = `${body.slice(0, sliceLen)}\n…(truncated; raise K0_IDEATION_DEPS_SUMMARY_MAX_CHARS if needed)`;
    }
    return body;
  } catch {
    return "(package.json unavailable)";
  }
}
