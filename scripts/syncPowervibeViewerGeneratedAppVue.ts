/**
 * Writes `viewer/generated/App.vue` from the canonical default bundle SFC + viewer mirror transform.
 * Run after changing `DEFAULT_POWERVIBE_SFC` in `powervibeMaterialize.ts`: `npm run powervibe:sync-viewer-app`
 */
import { writeFile } from "node:fs/promises";
import {
  adaptPowervibeSourceForViewerMirror,
  DEFAULT_POWERVIBE_SFC,
  MATERIALIZED_APP_VUE,
} from "../app/src/components/powervibe/viewer/powervibeMaterialize.ts";

const next = adaptPowervibeSourceForViewerMirror(DEFAULT_POWERVIBE_SFC);
await writeFile(MATERIALIZED_APP_VUE, next, "utf8");
console.log("Wrote", MATERIALIZED_APP_VUE);
