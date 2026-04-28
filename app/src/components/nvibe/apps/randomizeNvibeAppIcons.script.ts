/**
 * One-off: persist random `app_icon` values on all Scribe `nvibe_app` rows.
 *
 * Run from repo root (Scribe up, `SCRIBE_URL` / default localhost:1337):
 *   npm run nvibe:randomize-icons
 */
import "@/lib/env";
import { ScribeNvibeAppRepository } from "@/subjects/nvibe/ScribeNvibeAppRepository";

async function main(): Promise<void> {
  const repo = new ScribeNvibeAppRepository();
  const { updated, assignments } = await repo.randomizePersistedAppIcons();
  console.log(`Updated ${updated} nvibe_app row(s).`);
  for (const a of assignments) {
    console.log(`  ${a.app_id} → ${a.app_icon}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
