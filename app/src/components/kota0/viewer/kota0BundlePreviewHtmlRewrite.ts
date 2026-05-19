// Relative import (not `@/`) so this file is loadable by Vite's plugin chain at
// vite.config.ts compile-time — Node has no tsconfig-paths resolver there.
import { K0_BUNDLE_PREVIEW_PROXY_PREFIX } from "./kota0BundlePreviewConstants";

/**
 * Rewrite a bundle's `dist/index.html` so scripts/styles load through the workspace proxy
 * prefix instead of relative to the workspace origin. Idempotent: re-running on already
 * rewritten HTML returns the same string. Used by both the Vite dev plugin and the Koa
 * production middleware so behavior matches in both environments.
 */
export function rewriteKota0BundleIndexHtml(html: string): string {
  if (html.includes(`${K0_BUNDLE_PREVIEW_PROXY_PREFIX}/assets/`)) {
    return html;
  }
  let out = html;
  if (!/<base\s/i.test(out)) {
    out = out.replace(
      /<head(\s[^>]*)?>/i,
      `<head$1>\n    <base href="${K0_BUNDLE_PREVIEW_PROXY_PREFIX}/">`,
    );
  }
  out = out.replace(/\b(src|href)=(["'])\/assets\//g, `$1=$2${K0_BUNDLE_PREVIEW_PROXY_PREFIX}/assets/`);
  return out;
}
