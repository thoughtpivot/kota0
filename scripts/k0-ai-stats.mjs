#!/usr/bin/env node
/**
 * Print aggregate Kota0 AI turn stats from a *running workspace* process.
 *
 * The stats array is process-local (in-memory) inside Flight. A separate node
 * process cannot see it directly — we have to ask the workspace over HTTP via
 * `GET /api/kota0/ai/stats?limit=N`.
 *
 * Usage:
 *   FLIGHT_PORT=3000 npm run k0:ai-stats         # default port
 *   K0_WORKSPACE_ORIGIN=http://127.0.0.1:3000 npm run k0:ai-stats 100
 */

const DEFAULT_PORT = process.env.FLIGHT_PORT?.trim() || "3000";
const ORIGIN =
  process.env.K0_WORKSPACE_ORIGIN?.trim() ||
  `http://127.0.0.1:${DEFAULT_PORT}`;

function aggregate(stats) {
  if (stats.length === 0) return null;
  const n = stats.length;
  const sum = (key) =>
    stats.reduce((a, s) => (typeof s[key] === "number" ? a + s[key] : a), 0);
  const cnt = (key) =>
    stats.reduce((a, s) => (typeof s[key] === "number" ? a + 1 : a), 0);
  const avg = (key) => {
    const c = cnt(key);
    return c > 0 ? sum(key) / c : null;
  };
  const complexCount = stats.filter((s) => s.classifierComplex === true).length;
  const trivialCount = stats.filter((s) => s.classifierComplex === false).length;
  return {
    turns: n,
    complex: complexCount,
    trivial: trivialCount,
    complexShare: n > 0 ? complexCount / n : 0,
    avgTotalMs: avg("totalMs"),
    avgClassifierMs: avg("classifierMs"),
    avgApplyStepCount: avg("applyStepCount"),
    avgPlanTokensIn: avg("planTokensIn"),
    avgPlanTokensOut: avg("planTokensOut"),
    avgApplyTokensIn: avg("applyTokensIn"),
    avgApplyTokensOut: avg("applyTokensOut"),
    modelIds: [...new Set(stats.map((s) => s.modelId).filter(Boolean))],
  };
}

async function main() {
  const limit = Number(process.argv[2] || "50");
  const url = `${ORIGIN}/api/kota0/ai/stats?limit=${encodeURIComponent(String(limit))}`;
  let r;
  try {
    r = await fetch(url);
  } catch (e) {
    console.error(
      `Could not reach workspace at ${ORIGIN}. Is \`npm run start:app\` running? (set K0_WORKSPACE_ORIGIN or FLIGHT_PORT to point elsewhere)\n  ${e instanceof Error ? e.message : e}`,
    );
    process.exit(1);
  }
  if (!r.ok) {
    console.error(`HTTP ${r.status} from ${url}`);
    process.exit(1);
  }
  const body = await r.json();
  const stats = Array.isArray(body.stats) ? body.stats : [];
  if (stats.length === 0) {
    console.log(
      "No in-memory AI stats recorded yet. Send chat messages in the workspace, then re-run.",
    );
    return;
  }
  const agg = aggregate(stats);
  console.log(JSON.stringify({ summary: agg, recent: stats.slice(-10) }, null, 2));
}

void main();
