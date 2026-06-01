/** Rewrite common model mistakes for bundle API URL helper imports in App.vue. */
export function sanitizeKota0AppVueBundleApiImports(source: string): string {
  return source
    .replace(
      /from\s+(["'])@shared\/bundleApi\1/g,
      'from "./src/bundleApi"',
    )
    .replace(
      /from\s+(["'])@\/bundleApi\1/g,
      'from "./src/bundleApi"',
    );
}
