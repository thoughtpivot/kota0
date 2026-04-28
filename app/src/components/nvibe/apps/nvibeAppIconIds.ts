/**
 * Allowlisted `app_icon` values stored on Scribe `nvibe_app.data` (kebab ids).
 * UI maps these to `@heroicons/vue/24/outline` — keep in sync with NvibeView.vue.
 * (Random picks for create/tooling live in `nvibeAppIconRandom.ts` — Node only.)
 */
export const NVIBE_APP_ICON_IDS = [
  "squares-2x2",
  "cube",
  "sparkles",
  "bolt",
  "rectangle-stack",
  "circle-stack",
  "window",
  "chart-bar",
] as const;

export type NvibeAppIconId = (typeof NVIBE_APP_ICON_IDS)[number];

const SET = new Set<string>(NVIBE_APP_ICON_IDS);

export function isNvibeAppIconId(s: string): s is NvibeAppIconId {
  return SET.has(s);
}

/** Stable icon per app when `app_icon` is missing on legacy Scribe rows (read path only). */
export function defaultNvibeAppIconId(appId: string): NvibeAppIconId {
  let h = 0;
  for (let i = 0; i < appId.length; i++) {
    h = (h * 31 + appId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % NVIBE_APP_ICON_IDS.length;
  return NVIBE_APP_ICON_IDS[idx]!;
}
