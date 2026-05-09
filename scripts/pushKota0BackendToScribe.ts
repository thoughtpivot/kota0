/**
 * Push `bundles/<appId>/App.backend.ts` into Scribe `k0_app` as `backendSource`
 * (same path Apply uses). Requires repo `.env` with reachable Scribe (e.g. SCRIBE_URL).
 *
 * Usage: `npx dotenv-cli -e .env -- npx tsx -r tsconfig-paths/register scripts/pushKota0BackendToScribe.ts [appId]`
 */
import "@/lib/env";

import { readFileSync } from "node:fs";
import path from "node:path";
import { ScribeKota0AppRepository } from "@/components/kota0/apps/ScribeKota0AppRepository.ts";

const APP_ID = process.argv[2] ?? "01fb6584-e16f-4f7c-8b00-45fb1cb0c99f";

async function main(): Promise<void> {
  const backendPath = path.join(process.cwd(), "bundles", APP_ID, "App.backend.ts");
  const backendSource = readFileSync(backendPath, "utf8");
  const repo = new ScribeKota0AppRepository();
  const app = await repo.getApp(APP_ID);
  if (!app) {
    console.error(`App not found in Scribe: ${APP_ID}`);
    process.exit(1);
  }
  await repo.updateAppSources(APP_ID, {
    source: app.source,
    backendSource,
    ...(app.bundleEnv !== undefined ? { bundleEnv: app.bundleEnv } : {}),
  });
  console.log(`Scribe k0_app backendSource updated for ${APP_ID}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
