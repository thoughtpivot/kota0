import type { InjectionKey } from "vue";

export type ClientStripAssets = {
  manifest: typeof import("../branding/clients/manifest.json");
  logoUrls: Record<string, string>;
};

export const ncClientStripKey: InjectionKey<ClientStripAssets> = Symbol("ncClientStrip");
