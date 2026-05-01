/**
 * Model output sometimes imports `PolarAreaElement` from `chart.js` — that symbol does not exist
 * in Chart.js v4 (controllers such as `PolarAreaController` are registered in the bundle’s
 * `src/chartJsSetup.ts`, already imported from `src/main.ts`). Strip the invalid import +
 * `ChartJS.register(...)` block so `vite build` succeeds.
 */
export function sanitizeChartJsModelArtifactsInAppVueSource(source: string): string {
  if (!source.includes("PolarAreaElement")) return source;

  let out = source;

  out = out.replace(
    /^\s*import\s*\{[\s\S]*?\bChart\s+as\s+ChartJS[\s\S]*?\}\s*from\s*['"]chart\.js['"];\s*\r?\n?/m,
    "",
  );

  out = out.replace(/^\s*ChartJS\.register\([\s\S]*?\);\s*\r?\n?/m, "");

  out = out.replace(
    /import\s*\{\s*Doughnut\s*,\s*Line\s*,\s*Bar\s*,\s*Radar\s*,\s*PolarArea\s*,\s*Bubble\s*\}\s*from\s*['"]vue-chartjs['"]\s*;/,
    'import { Line, Radar, PolarArea, Bubble } from "vue-chartjs";',
  );

  return out;
}
