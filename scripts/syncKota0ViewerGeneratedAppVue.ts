/**
 * Writes `viewer/generated/App.vue` from the canonical default bundle SFC + viewer mirror transform.
 * Run after changing `DEFAULT_K0_SFC` in `kota0Materialize.ts`: `npm run kota0:sync-viewer-app`
 */
import { writeFile } from "node:fs/promises";
import {
  adaptKota0SourceForViewerMirror,
  DEFAULT_K0_SFC,
  MATERIALIZED_APP_VUE,
} from "../app/src/components/kota0/viewer/kota0Materialize.ts";

const next = adaptKota0SourceForViewerMirror(DEFAULT_K0_SFC);
await writeFile(MATERIALIZED_APP_VUE, next, "utf8");
console.log("Wrote", MATERIALIZED_APP_VUE);
