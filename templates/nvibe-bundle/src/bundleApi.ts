/**
 * Re-export shared resolver so bundle Flight and workspace tooling stay aligned.
 * (`@` maps to `app/src` in `vite.config.ts`.)
 */
export { nvibeBundleApiUrl as bundleApiUrl } from "@/components/nvibe/viewer/nvibeBundleApiUrl";
