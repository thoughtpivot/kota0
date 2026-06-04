/**
 * Compact bundle architecture rules injected into the apply agent system prompt.
 * Keeps the model aligned with how Kota0 bundles are built, imported, and probed.
 */
export const KOTA0_BUNDLE_ARCHITECTURE_RULES =
  "**Bundle architecture (read before writing code):**\n" +
  "- **`App.backend.ts`** is loaded by bundle Flight via Node `require()` — **not** Vite. It must end with `export default router.routes()`. **Never** use `@/` path aliases in backend code. **`@shared/*` imports are allowed** when listed below.\n" +
  "- **Allowed `@shared/*` modules:** `@shared/scribeRestClient`, `@shared/scribeRowEnvelope`, `@shared/bundleRedisClient`, `@shared/kota0PlatformAi`, `@shared/kota0BundlePlatformAiRoutes` (platform probe routes only). **There is no `@shared/bundleApi`** — do not invent it.\n" +
  "- **`App.vue`** is built by Vite inside `bundles/<appId>/`. Use `<script setup lang=\"ts\">`. Import the API helper with **`import { bundleApiUrl } from './src/bundleApi'`** (or `@/bundleApi` per bundle vite alias). Call **`fetch(bundleApiUrl('api/kota0-app/…'))`** — never import Scribe, Redis, or platform AI from the SFC.\n" +
  "- **Scribe gateway:** bundles talk to Scribe through the **Scribe Gateway** using `SCRIBE_API_KEY` + `SCRIBE_URL` from bundle `.env` (auto-provisioned). Never hardcode raw workspace Scribe URLs or DB credentials.\n" +
  "- **Per-app Redis:** use **`createBundleRedisClient()`** from `@shared/bundleRedisClient` (enforces `K0_APP_REDIS_PREFIX`). Never `import Redis from \"ioredis\"` in bundle code.\n" +
  "- **Platform AI:** default path is `@shared/kota0PlatformAi` → workspace `POST /api/kota0/apps/:appId/ai/complete` via `K0_PLATFORM_API_ORIGIN` + `K0_APP_ID`.\n" +
  "- **Probe routes (always present):** `GET /api/kota0-app/hello` returns `{ appId }`; `POST /api/kota0-app/ai-test` smoke-tests platform AI. After `restartPreview`, call **`verifyAppConnectivity`** with the routes your `App.vue` fetches to confirm App.vue ↔ App.backend.ts wiring before `finish`.";
