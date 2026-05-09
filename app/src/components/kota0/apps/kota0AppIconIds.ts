/**
 * Allowlisted `app_icon` values stored on Scribe `k0_app.data` (kebab ids).
 * UI maps these to `@heroicons/vue/24/outline` — keep in sync with Kota0View.vue.
 * (Random picks for create/tooling live in `kota0AppIconRandom.ts` — Node only.)
 */
export const K0_APP_ICON_IDS = [
  "squares-2x2",
  "cube",
  "sparkles",
  "bolt",
  "rectangle-stack",
  "circle-stack",
  "window",
  "chart-bar",
] as const;

export type Kota0AppIconId = (typeof K0_APP_ICON_IDS)[number];

const SET = new Set<string>(K0_APP_ICON_IDS);

export function isKota0AppIconId(s: string): s is Kota0AppIconId {
  return SET.has(s);
}

/** Stable icon per app when `app_icon` is missing on legacy Scribe rows (read path only). */
export function defaultKota0AppIconId(appId: string): Kota0AppIconId {
  let h = 0;
  for (let i = 0; i < appId.length; i++) {
    h = (h * 31 + appId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % K0_APP_ICON_IDS.length;
  return K0_APP_ICON_IDS[idx]!;
}
