import { randomInt } from "node:crypto";
import { POWERVIBE_APP_ICON_IDS, type PowervibeAppIconId } from "./powervibeAppIconIds";

/** Server / Node only — do not import from client bundles. */
export function randomPowervibeAppIconId(): PowervibeAppIconId {
  const i = randomInt(0, POWERVIBE_APP_ICON_IDS.length);
  return POWERVIBE_APP_ICON_IDS[i]!;
}
