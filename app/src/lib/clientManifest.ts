import manifest from "../../../branding/clients/manifest.json";

export type ClientEntry = (typeof manifest.clients)[number];

export const clientManifest = manifest;

export function clientLogoUrl(logoFile: string): string {
  return new URL(`../../../branding/clients/logos/${logoFile}`, import.meta.url).href;
}
