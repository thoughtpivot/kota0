import { defineConfig } from "vite";
import appViteConfig from "./app/vite.config.ts";

/**
 * Repo-root config is picked up by Flight / `vite` from `.` and by **Slidev** when you run
 * `slidev` from the monorepo root. Re-exporting `app/vite.config.ts` alone breaks Slidev dev
 * (wrong `root`, port, plugins → blank page on :3030).
 */
function isSlidevCli(): boolean {
  const ev = process.env.npm_lifecycle_event;
  if (ev === "start:slides" || ev === "build:slides:pdf") return true;
  const joined = process.argv.join(" ");
  return joined.includes("slidev") || joined.includes("@slidev/cli");
}

export default isSlidevCli() ? defineConfig({}) : appViteConfig;
