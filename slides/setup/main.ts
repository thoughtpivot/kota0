/**
 * Global Slidev setup — shared CSS + client manifest/logos from `branding/`.
 * All `branding/` imports are resolved from this file (`slides/setup/`), not from Vue SFCs.
 */
import type { AppContext } from "@slidev/types";
import "../../branding/fonts/fonts.css";
import "../../branding/tokens/tokens.css";
import "../styles/slides.css";
import { ncClientStripKey } from "../clientInjectKeys";
import manifest from "../../branding/clients/manifest.json";

const clientLogoUrls = import.meta.glob<string>("../../branding/clients/logos/*", {
  eager: true,
  query: "?url",
  import: "default",
});

export default async function setup({ app }: AppContext) {
  app.provide(ncClientStripKey, {
    manifest,
    logoUrls: clientLogoUrls,
  });
}
