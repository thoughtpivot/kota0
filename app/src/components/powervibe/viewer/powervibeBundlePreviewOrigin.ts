import { POWERVIBE_BUNDLE_PREVIEW_PROXY_PREFIX } from "@/components/powervibe/viewer/powervibeBundlePreviewConstants";

/**
 * Base URL for the PowerVibe bundle Flight preview (static `dist/` + `App.backend.ts` on port 4000).
 *
 * **Development:** By default the iframe uses the same origin as the workspace plus
 * {@link POWERVIBE_BUNDLE_PREVIEW_PROXY_PREFIX}, proxied to `127.0.0.1:4000` by Vite. Embedded
 * browsers (e.g. IDE shell) often block a cross-port loopback iframe (white screen) while a
 * normal tab to `:4000` works.
 *
 * **Production / explicit origin:** `VITE_POWERVIBE_BUNDLE_PREVIEW_ORIGIN` or direct
 * `protocol//hostname:4000`. Loopback hostnames are normalized to match the page.
 */
export function powervibeBundlePreviewBaseUrl(): string {
  const env = (import.meta.env.VITE_POWERVIBE_BUNDLE_PREVIEW_ORIGIN as string | undefined)?.trim();
  const proxyOff =
    (import.meta.env.VITE_POWERVIBE_BUNDLE_PREVIEW_PROXY as string | undefined)?.trim() === "false";

  if (typeof window === "undefined") {
    return env?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
  }

  const { protocol, hostname, origin } = window.location;

  if (import.meta.env.DEV && !proxyOff && !env) {
    return `${origin}${POWERVIBE_BUNDLE_PREVIEW_PROXY_PREFIX}`.replace(/\/$/, "");
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
