// Relative import (not `@/`) so this file is loadable by Vite's plugin chain at
// vite.config.ts compile-time — Node has no tsconfig-paths resolver there.
import { K0_BUNDLE_PREVIEW_PROXY_PREFIX } from "./kota0BundlePreviewConstants";

/**
 * Rewrite a bundle's `dist/index.html` so scripts/styles load through a workspace-side
 * proxy prefix instead of relative to the workspace origin. Idempotent: re-running on
 * already rewritten HTML returns the same string.
 *
 * Used by both the preview proxy (prefix `/__k0_bundle`) and the deploy proxy (prefix
 * `/__k0_deploy/<deploymentId>`). `prefix` must NOT include a trailing slash; the
 * function appends `/` where needed.
 */
export function rewriteKota0BundleHtmlForPrefix(html: string, prefix: string): string {
  const cleanPrefix = prefix.replace(/\/+$/, "");
  if (html.includes(`${cleanPrefix}/assets/`)) {
    return html;
  }
  let out = html;
  if (!/<base\s/i.test(out)) {
    out = out.replace(
      /<head(\s[^>]*)?>/i,
      `<head$1>\n    <base href="${cleanPrefix}/">`,
    );
  }
  out = out.replace(/\b(src|href)=(["'])\/assets\//g, `$1=$2${cleanPrefix}/assets/`);
  return out;
}

/** Back-compat wrapper for callers that only handle the preview prefix. */
export function rewriteKota0BundleIndexHtml(html: string): string {
  return rewriteKota0BundleHtmlForPrefix(html, K0_BUNDLE_PREVIEW_PROXY_PREFIX);
}
