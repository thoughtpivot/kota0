/**
 * One-off: persist random `app_icon` values on all Scribe `kota0_app` rows.
 *
 * Run from repo root (Scribe up, `SCRIBE_URL` / default localhost:1337):
 *   npm run kota0:randomize-icons
 */
import "@/lib/env";
import { ScribeKota0AppRepository } from "@/subjects/kota0/ScribeKota0AppRepository";

async function main(): Promise<void> {
  const repo = new ScribeKota0AppRepository();
  const { updated, assignments } = await repo.randomizePersistedAppIcons();
  console.log(`Updated ${updated} kota0_app row(s).`);
  for (const a of assignments) {
    console.log(`  ${a.app_id} → ${a.app_icon}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
