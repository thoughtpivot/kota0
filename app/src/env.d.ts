/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/vue" />

interface ImportMetaEnv {
  /** Leave unset in Flight dev so fetch uses `/api/plan` (Vite → Koa). Do not use `http://…:3001` alone. */
  readonly VITE_PLAN_API_URL?: string;
  /** Koa listen port for direct PowerVibe API calls in dev (default 3000). Match `FLIGHT_PORT`. */
  readonly VITE_FLIGHT_PORT?: string;
  /** Full origin for Koa (e.g. `http://127.0.0.1:3000`) when dev UI must bypass the Vite proxy. */
  readonly VITE_KOA_ORIGIN?: string;
  /** When `1` or `true`, PowerVibe chat uses SSE `POST …/messages/stream` for Gemini streaming + progress. */
  readonly VITE_POWERVIBE_CHAT_STREAM?: string;
  /** Origin for per-app preview (Flight prod + static `dist/`). Default `http://127.0.0.1:4000`. */
  readonly VITE_POWERVIBE_BUNDLE_PREVIEW_ORIGIN?: string;
  /** Set to `false` to skip same-origin `/__powervibe_bundle` preview proxy in dev (iframe loads `:4000` directly). */
  readonly VITE_POWERVIBE_BUNDLE_PREVIEW_PROXY?: string;
  /** Full URL to Slidev in dev (e.g. `http://127.0.0.1:3030/`) for the header “briefing deck” modal. */
  readonly VITE_POWERVIBE_GUIDE_SLIDEV_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** PowerVibe preview `App.vue` may load Chart.js from a CDN and use `new window.Chart(...)`. */
declare global {
  interface Window {
    Chart?: new (canvas: HTMLCanvasElement, config: unknown) => unknown;
  }
}

export {};
