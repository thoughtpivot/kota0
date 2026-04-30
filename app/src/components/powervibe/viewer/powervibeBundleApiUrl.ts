import { NVIBE_BUNDLE_PREVIEW_PROXY_PREFIX } from "@/components/nvibe/viewer/nvibeBundlePreviewConstants";

/**
 * Document base for resolving bundle Flight routes (`App.backend.ts` on port 4000).
 *
 * Under the workspace preview, the iframe URL is under {@link NVIBE_BUNDLE_PREVIEW_PROXY_PREFIX}. If `<base href>`
 * is missing or `document.baseURI` falls back to the origin root, relative `api/…` URLs become `/api/…` at the
 * workspace origin — which matches Vite's `/api` proxy; that proxy strips `/api`, so Koa sees `/nvibe-app/…`
 * instead of `/api/nvibe-app/…` and bundle routes 404. Anchoring on the preview prefix avoids that.
 */
export function nvibeBundleApiResolveBase(): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "/";
  }
  const { origin, pathname } = window.location;
  const p = NVIBE_BUNDLE_PREVIEW_PROXY_PREFIX;
  if (pathname === p || pathname.startsWith(`${p}/`)) {
    return `${origin}${p}/`;
  }
  return document.baseURI || `${origin}/`;
}

/** Resolve a bundle-app API path (no leading slash) against {@link nvibeBundleApiResolveBase}. */
export function nvibeBundleApiUrl(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, "");
  return new URL(trimmed, nvibeBundleApiResolveBase()).href;
}
