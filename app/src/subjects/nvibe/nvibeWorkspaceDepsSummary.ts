/**
 * Bounded summary of workspace `dependencies` (+ allowlisted Tailwind/Daisy devDeps) for nVibe ideation.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_MAX_CHARS = 6000;

export function resolveNvibeIdeationDepsSummaryMaxChars(): number {
  const raw = process.env.NVIBE_IDEATION_DEPS_SUMMARY_MAX_CHARS?.trim();
  if (!raw) return DEFAULT_MAX_CHARS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 500) return DEFAULT_MAX_CHARS;
  return Math.min(Math.floor(n), 100_000);
}

/** Tailwind + DaisyUI are devDependencies but affect generated `App.vue` styling in preview. */
const NVIBE_DEV_DEP_ALLOWLIST = ["daisyui", "tailwindcss", "unplugin-icons"] as const;

/** Sorted `name@range` lines from repo-root `package.json` dependencies, plus allowlisted devDeps (bounded). */
export function getNvibeWorkspaceDepsSummary(cwd: string = process.cwd()): string {
  const max = resolveNvibeIdeationDepsSummaryMaxChars();
  try {
    const file = path.join(cwd, "package.json");
    const raw = readFileSync(file, "utf8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = pkg.dependencies && typeof pkg.dependencies === "object" ? pkg.dependencies : {};
    const devDeps = pkg.devDependencies && typeof pkg.devDependencies === "object" ? pkg.devDependencies : {};
    const lines = Object.keys(deps)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => {
        const v = deps[k];
        return `${k}@${typeof v === "string" ? v : String(v)}`;
      });
    const devExtra: string[] = [];
    for (const k of NVIBE_DEV_DEP_ALLOWLIST) {
      const v = devDeps[k];
      if (typeof v === "string" && v.length > 0) {
        const note =
          k === "unplugin-icons" ?
            "devDependency; Iconify `~icons/…` imports in nVibe preview build"
          : "devDependency; Tailwind/Daisy stack for nVibe preview";
        devExtra.push(`${k}@${v} (${note})`);
      }
    }
    let body = lines.join("\n");
    if (devExtra.length > 0) {
      body = body.length > 0 ? `${body}\n${devExtra.join("\n")}` : devExtra.join("\n");
    }
    if (body.length === 0) {
      return "(no dependencies in package.json)";
    }
    if (body.length > max) {
      body = `${body.slice(0, max)}\n…(truncated; raise NVIBE_IDEATION_DEPS_SUMMARY_MAX_CHARS if needed)`;
    }
    return body;
  } catch {
    return "(package.json unavailable)";
  }
}
