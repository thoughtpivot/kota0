import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vite";
import { powervibeGeneratedSfcSanitizePlugin } from "./vite.powervibeGeneratedPlugin";
import { powervibeBundlePreviewProxyPlugin } from "./vite.powervibeBundlePreviewProxy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

loadEnv({ path: path.join(repoRoot, ".env"), quiet: true });

const powervibeBundleProxyTargetPort = Number.parseInt(
  String(process.env.VITE_POWERVIBE_BUNDLE_PROXY_TARGET_PORT ?? "4000"),
  10,
);
const powervibeBundleProxyPort =
  Number.isFinite(powervibeBundleProxyTargetPort) && powervibeBundleProxyTargetPort > 0 ?
    powervibeBundleProxyTargetPort
  : 4000;

/**
 * Koa (Flight) must be targeted — never the embedded Vite dev port (3001), or `/api/*` hits Vite and returns HTML 404 ("Not Found").
 * Use FLIGHT_PORT only; do not fall back to deprecated PLAN_API_PORT=3001.
 */
const EMBEDDED_VITE_PORT = 3001;
const rawKoaPort = Number(process.env.FLIGHT_PORT || process.env.VITE_KOA_PORT || 3000);
let koaProxyPort = Number.isFinite(rawKoaPort) && rawKoaPort > 0 ? rawKoaPort : 3000;
if (koaProxyPort === EMBEDDED_VITE_PORT) {
  console.warn(
    `[vite] FLIGHT_PORT=${koaProxyPort} matches embedded Vite; forcing /api proxy to 3000. Set FLIGHT_PORT to your Koa port (default 3000).`,
  );
  koaProxyPort = 3000;
}

/**
 * Forward `/api/*` to Flight **with the `/api` prefix intact**.
 * `*.backend.ts` routers register paths like `/api/powervibe/...` and `/api/plan`; stripping `/api` here
 * made proxied requests miss every route (HTTP 404 “Not Found”).
 */
const planApiProxy = {
  "/api": {
    target: `http://127.0.0.1:${koaProxyPort}`,
    changeOrigin: true,
  },
} as const;

export default defineConfig({
  root: __dirname,
  envDir: repoRoot,
  plugins: [
    powervibeBundlePreviewProxyPlugin({ targetPort: powervibeBundleProxyPort }),
    powervibeGeneratedSfcSanitizePlugin(),
    vue(),
    Icons({
      compiler: "vue3",
      autoInstall: true,
    }),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        powervibePreview: path.resolve(__dirname, "powervibe-preview.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(repoRoot, "shared"),
    },
  },
  server: {
    /**
     * Must differ from `FLIGHT_PORT` (default 3000) so `/api` proxies to Koa instead of back into Vite.
     * Matches Flight dev: `npx vite --port 3001` from `@spytech/flight`.
     */
    port: 3001,
    /**
     * Without strictPort, Vite would try 3002, 3003, … and could land on 3030 — the same port Slidev uses by default.
     */
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
    proxy: planApiProxy,
  },
  // `vite preview` does not inherit `server.proxy` — duplicate so `/api/plan` works after build.
  preview: {
    proxy: planApiProxy,
  },
});
