import { K0_BUNDLE_PREVIEW_PROXY_PREFIX } from "@/components/kota0/viewer/kota0BundlePreviewConstants";

/**
 * Base URL for the Kota0 bundle Flight preview (static `dist/` + `App.backend.ts` on port 4000).
 *
 * **Development:** By default the iframe uses the same origin as the workspace plus
 * {@link K0_BUNDLE_PREVIEW_PROXY_PREFIX}, proxied to `127.0.0.1:4000` by Vite. Embedded
 * browsers (e.g. IDE shell) often block a cross-port loopback iframe (white screen) while a
 * normal tab to `:4000` works.
 *
 * **Production / explicit origin:** `VITE_K0_BUNDLE_PREVIEW_ORIGIN` or direct
 * `protocol//hostname:4000`. Loopback hostnames are normalized to match the page.
 */
export function kota0BundlePreviewBaseUrl(): string {
  const env = (import.meta.env.VITE_K0_BUNDLE_PREVIEW_ORIGIN as string | undefined)?.trim();
  const proxyOff =
    (import.meta.env.VITE_K0_BUNDLE_PREVIEW_PROXY as string | undefined)?.trim() === "false";

  if (typeof window === "undefined") {
    return env?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
  }

  const { protocol, hostname, origin } = window.location;

  // Default for both dev (Vite plugin) and prod (Koa middleware): hit the same workspace
  // origin through the `/__k0_bundle` proxy prefix. Set `VITE_K0_BUNDLE_PREVIEW_PROXY=false`
  // to opt out (e.g. you want a direct `<host>:4000` iframe for ad-hoc debugging).
  if (!proxyOff && !env) {
    return `${origin}${K0_BUNDLE_PREVIEW_PROXY_PREFIX}`.replace(/\/$/, "");
  }

  if (!env) {
    return `${protocol}//${hostname}:4000`;
  }

  try {
    const u = new URL(env.includes("://") ? env : `http://${env}`);
    const isLoop = (h: string): boolean =>
      h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
    if (isLoop(hostname) && isLoop(u.hostname)) {
      return `${protocol}//${hostname}:${u.port || "4000"}`;
    }
    return u.origin.replace(/\/$/, "");
  } catch {
    return `${protocol}//${hostname}:4000`;
  }
}
