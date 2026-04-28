import { randomInt } from "node:crypto";
import { NVIBE_APP_ICON_IDS, type NvibeAppIconId } from "./nvibeAppIconIds";

/** Server / Node only — do not import from client bundles. */
export function randomNvibeAppIconId(): NvibeAppIconId {
  const i = randomInt(0, NVIBE_APP_ICON_IDS.length);
  return NVIBE_APP_ICON_IDS[i]!;
}
