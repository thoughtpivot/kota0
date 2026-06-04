/**
 * Re-export shared resolver so bundle Flight and workspace tooling stay aligned.
 * Use `import … from './src/bundleApi'` in `App.vue`, or `from '@/bundleApi'` (see `vite.config.ts` alias).
 */
export { bundleApiUrl as bundleApiUrl } from "@/components/kota0/viewer/host/bundleApiUrl";
