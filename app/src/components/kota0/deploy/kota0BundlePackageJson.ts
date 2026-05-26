import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveKota0RepoRoot } from "@/components/kota0/viewer/kota0Materialize";

/**
 * Full package.json for a per-app bundle: mirrors workspace runtime deps so generated `App.vue`
 * can import the same libraries; adds dev tooling for `vite build`.
 */
export function buildKota0BundlePackageJson(): Record<string, unknown> {
  const root = resolveKota0RepoRoot();
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    overrides?: Record<string, unknown>;
  };
  const dependencies = pkg.dependencies && typeof pkg.dependencies === "object" ? { ...pkg.dependencies } : {};
  const devDeps = pkg.devDependencies ?? {};
  const pick = (k: string) => devDeps[k];

  const devDependencies: Record<string, string> = {};
  for (const key of [
    "@tailwindcss/vite",
    "@vitejs/plugin-vue",
    "daisyui",
    "tailwindcss",
    "vite",
    "unplugin-icons",
    "typescript",
    "tsx",
    "tsconfig-paths",
  ] as const) {
    const v = pick(key);
    if (typeof v === "string" && v.length > 0) devDependencies[key] = v;
  }

  return {
    name: "kota0-app-bundle",
    private: true,
    license: "Apache-2.0",
    type: "module",
    scripts: {
      build: "vite build --config vite.config.ts",
    },
    dependencies,
    devDependencies,
    ...(pkg.overrides ? { overrides: pkg.overrides } : {}),
  };
}
