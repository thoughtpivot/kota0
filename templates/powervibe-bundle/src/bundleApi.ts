/**
 * Re-export shared resolver so bundle Flight and workspace tooling stay aligned.
 * Use `import … from './src/bundleApi'` in `App.vue`, or `from '@/bundleApi'` (see `vite.config.ts` alias).
 */
export { powervibeBundleApiUrl as bundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";
