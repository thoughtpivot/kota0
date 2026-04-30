import { POWERVIBE_BUNDLE_PREVIEW_PROXY_PREFIX } from "@/components/powervibe/viewer/powervibeBundlePreviewConstants";

/**
 * Document base for resolving bundle Flight routes (`App.backend.ts` on port 4000).
 *
 * Under the workspace preview, the iframe URL is under {@link POWERVIBE_BUNDLE_PREVIEW_PROXY_PREFIX}. If `<base href>`
 * is missing or `document.baseURI` falls back to the origin root, relative `api/…` URLs become `/api/…` at the
 * workspace origin — which matches Vite's `/api` proxy; that proxy strips `/api`, so Koa sees `/powervibe-app/…`
 * instead of `/api/powervibe-app/…` and bundle routes 404. Anchoring on the preview prefix avoids that.
 */
export function powervibeBundleApiResolveBase(): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "/";
  }
  const { origin, pathname } = window.location;
  const p = POWERVIBE_BUNDLE_PREVIEW_PROXY_PREFIX;
  if (pathname === p || pathname.startsWith(`${p}/`)) {
    return `${origin}${p}/`;
  }
  return document.baseURI || `${origin}/`;
}

/** Resolve a bundle-app API path (no leading slash) against {@link powervibeBundleApiResolveBase}. */
export function powervibeBundleApiUrl(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, "");
  return new URL(trimmed, powervibeBundleApiResolveBase()).href;
}
