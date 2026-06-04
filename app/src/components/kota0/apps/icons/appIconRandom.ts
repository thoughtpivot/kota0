import { randomInt } from "node:crypto";
import { K0_APP_ICON_IDS, type AppIconId } from "@/components/kota0/apps/icons/appIconIds";

/** Server / Node only — do not import from client bundles. */
export function randomAppIconId(): AppIconId {
  const i = randomInt(0, K0_APP_ICON_IDS.length);
  return K0_APP_ICON_IDS[i]!;
}
