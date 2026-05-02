/**
 * Allowlisted `app_icon` values stored on Scribe `powervibe_app.data` (kebab ids).
 * UI maps these to `@heroicons/vue/24/outline` — keep in sync with PowervibeView.vue.
 * (Random picks for create/tooling live in `powervibeAppIconRandom.ts` — Node only.)
 */
export const POWERVIBE_APP_ICON_IDS = [
  "squares-2x2",
  "cube",
  "sparkles",
  "bolt",
  "rectangle-stack",
  "circle-stack",
  "window",
  "chart-bar",
] as const;

export type PowervibeAppIconId = (typeof POWERVIBE_APP_ICON_IDS)[number];

const SET = new Set<string>(POWERVIBE_APP_ICON_IDS);

export function isPowervibeAppIconId(s: string): s is PowervibeAppIconId {
  return SET.has(s);
}

/** Stable icon per app when `app_icon` is missing on legacy Scribe rows (read path only). */
export function defaultPowervibeAppIconId(appId: string): PowervibeAppIconId {
  let h = 0;
  for (let i = 0; i < appId.length; i++) {
    h = (h * 31 + appId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % POWERVIBE_APP_ICON_IDS.length;
  return POWERVIBE_APP_ICON_IDS[idx]!;
}
