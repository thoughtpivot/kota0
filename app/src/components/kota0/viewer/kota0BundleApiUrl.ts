import { K0_BUNDLE_PREVIEW_PROXY_PREFIX } from "@/components/kota0/viewer/kota0BundlePreviewConstants";

/**
 * Document base for resolving bundle Flight routes (`App.backend.ts` on port 4000).
 *
 * Under the workspace preview, the iframe URL is under {@link K0_BUNDLE_PREVIEW_PROXY_PREFIX}. If `<base href>`
 * is missing or `document.baseURI` falls back to the origin root, relative `api/…` URLs become `/api/…` at the
 * workspace origin — which matches Vite's `/api` proxy; that proxy strips `/api`, so Koa sees `/kota0-app/…`
 * instead of `/api/kota0-app/…` and bundle routes 404. Anchoring on the preview prefix avoids that.
 */
export function kota0BundleApiResolveBase(): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "/";
  }
  const { origin, pathname } = window.location;
  const p = K0_BUNDLE_PREVIEW_PROXY_PREFIX;
  if (pathname === p || pathname.startsWith(`${p}/`)) {
    return `${origin}${p}/`;
  }
  return document.baseURI || `${origin}/`;
}

/** Resolve a bundle-app API path (no leading slash) against {@link kota0BundleApiResolveBase}. */
export function kota0BundleApiUrl(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, "");
  return new URL(trimmed, kota0BundleApiResolveBase()).href;
}
