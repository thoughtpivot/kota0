import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import { kota0GeneratedSfcSanitizePlugin } from "../../app/vite.kota0GeneratedPlugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: bundles/<appId> → ../.. */
const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  root: __dirname,
  envDir: __dirname,
  plugins: [
    kota0GeneratedSfcSanitizePlugin(),
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
    alias: [
      /** Must win over `@` — otherwise `import … from '@/bundleApi'` resolves to missing `app/src/bundleApi`. */
      { find: "@/bundleApi", replacement: path.resolve(__dirname, "src/bundleApi.ts") },
      { find: "@", replacement: path.join(repoRoot, "app/src") },
      { find: "@shared", replacement: path.join(repoRoot, "shared") },
    ],
  },
});
