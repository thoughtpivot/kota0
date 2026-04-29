import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import { nvibeGeneratedSfcSanitizePlugin } from "../../app/vite.nvibeGeneratedPlugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: bundles/<appId> → ../.. */
const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  root: __dirname,
  envDir: __dirname,
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
    outDir: "dist",
    emptyDirBeforeWrite: true,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
    },
  },
  resolve: {
    alias: {
      "@": path.join(repoRoot, "app/src"),
      "@shared": path.join(repoRoot, "shared"),
    },
  },
});
