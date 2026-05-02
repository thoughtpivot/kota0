/**
 * One-off: persist random `app_icon` values on all Scribe `powervibe_app` rows.
 *
 * Run from repo root (Scribe up, `SCRIBE_URL` / default localhost:1337):
 *   npm run powervibe:randomize-icons
 */
import "@/lib/env";
import { ScribePowervibeAppRepository } from "@/components/powervibe/apps/ScribePowervibeAppRepository";

async function main(): Promise<void> {
  const repo = new ScribePowervibeAppRepository();
  const { updated, assignments } = await repo.randomizePersistedAppIcons();
  console.log(`Updated ${updated} powervibe_app row(s).`);
  for (const a of assignments) {
    console.log(`  ${a.app_id} → ${a.app_icon}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
