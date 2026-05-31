/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/vue" />

interface ImportMetaEnv {
  /** Koa listen port for direct Kota0 API calls in dev (default 3000). Match `FLIGHT_PORT`. */
  readonly VITE_FLIGHT_PORT?: string;
  /** Full origin for Koa (e.g. `http://127.0.0.1:3000`) when dev UI must bypass the Vite proxy. */
  readonly VITE_KOA_ORIGIN?: string;
  /** When `1` or `true`, Kota0 chat uses SSE `POST …/messages/stream` for Gemini streaming + progress. */
  readonly VITE_K0_CHAT_STREAM?: string;
  /** Origin for per-app preview (Flight prod + static `dist/`). Default `http://127.0.0.1:4000`. */
  readonly VITE_K0_BUNDLE_PREVIEW_ORIGIN?: string;
  /** Set to `false` to skip same-origin `/__k0_bundle` preview proxy in dev (iframe loads `:4000` directly). */
  readonly VITE_K0_BUNDLE_PREVIEW_PROXY?: string;
  /**
   * Full URL to the Slidev tutorial for the header “Tutorial” modal. Leave unset in **dev** to use
   * same-origin `…/__k0_slidev/…` (Vite proxies to Slidev so `/…` assets load correctly in the iframe).
   * Root opens **slide 2**; set a path to override. Adds `?embedded=true` when missing.
   */
  readonly VITE_K0_GUIDE_SLIDEV_URL?: string;
  /** Slidev listen port for the dev proxy (default **3030**). Match `npm run start:slides --port`. */
  readonly VITE_K0_GUIDE_SLIDEV_PROXY_TARGET_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Kota0 preview `App.vue` may load Chart.js from a CDN and use `new window.Chart(...)`. */
declare global {
  interface Window {
    Chart?: new (canvas: HTMLCanvasElement, config: unknown) => unknown;
  }
}

export {};
