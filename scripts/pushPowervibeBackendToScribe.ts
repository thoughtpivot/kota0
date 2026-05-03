/**
 * Push `bundles/<appId>/App.backend.ts` into Scribe `powervibe_app` as `backendSource`
 * (same path Apply uses). Requires repo `.env` with reachable Scribe (e.g. SCRIBE_URL).
 *
 * Usage: `npx dotenv-cli -e .env -- npx tsx -r tsconfig-paths/register scripts/pushPowervibeBackendToScribe.ts [appId]`
 */
import "@/lib/env";

import { readFileSync } from "node:fs";
import path from "node:path";
import { ScribePowervibeAppRepository } from "@/components/powervibe/apps/ScribePowervibeAppRepository.ts";

const APP_ID = process.argv[2] ?? "01fb6584-e16f-4f7c-8b00-45fb1cb0c99f";

async function main(): Promise<void> {
  const backendPath = path.join(process.cwd(), "bundles", APP_ID, "App.backend.ts");
  const backendSource = readFileSync(backendPath, "utf8");
  const repo = new ScribePowervibeAppRepository();
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
  console.log(`Scribe powervibe_app backendSource updated for ${APP_ID}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
