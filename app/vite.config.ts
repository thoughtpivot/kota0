import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vite";
import { nvibeGeneratedSfcSanitizePlugin } from "./vite.nvibeGeneratedPlugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

loadEnv({ path: path.join(repoRoot, ".env"), quiet: true });

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

const planApiProxy = {
  "/api": {
    target: `http://127.0.0.1:${koaProxyPort}`,
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ""),
  },
} as const;

export default defineConfig({
  root: __dirname,
  envDir: repoRoot,
  plugins: [
    nvibeGeneratedSfcSanitizePlugin(),
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
        nvibePreview: path.resolve(__dirname, "nvibe-preview.html"),
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
    port: 3000,
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
