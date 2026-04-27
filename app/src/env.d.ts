/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/vue" />

interface ImportMetaEnv {
  /** Leave unset in Flight dev so fetch uses `/api/plan` (Vite → Koa). Do not use `http://…:3001` alone. */
  readonly VITE_PLAN_API_URL?: string;
  /** Koa listen port for direct nVibe API calls in dev (default 3000). Match `FLIGHT_PORT`. */
  readonly VITE_FLIGHT_PORT?: string;
  /** Full origin for Koa (e.g. `http://127.0.0.1:3000`) when dev UI must bypass the Vite proxy. */
  readonly VITE_KOA_ORIGIN?: string;
  /** When `1` or `true`, nVibe chat uses SSE `POST …/messages/stream` for Gemini streaming + progress. */
  readonly VITE_NVIBE_CHAT_STREAM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** nVibe preview `App.vue` may load Chart.js from a CDN and use `new window.Chart(...)`. */
declare global {
  interface Window {
    Chart?: new (canvas: HTMLCanvasElement, config: unknown) => unknown;
  }
}

export {};
