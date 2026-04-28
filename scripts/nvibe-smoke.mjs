#!/usr/bin/env node
/**
 * Smoke: Koa nVibe routes + materialized files (via diagnostics).
 * Run with the dev app up: `npm run start:app` and Vite (or set NVIBE_SMOKE_BASE to your UI origin so /api is proxied).
 *
 * @example
 *   NVIBE_SMOKE_BASE=http://127.0.0.1:3001 node scripts/nvibe-smoke.mjs
 */

const base = (process.env.NVIBE_SMOKE_BASE || "http://127.0.0.1:3001").replace(/\/$/, "");

async function json(path) {
  const u = `${base}/api${path.startsWith("/") ? path : `/${path}`}`;
  let r;
  try {
    r = await fetch(u, { cache: "no-store" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 0, u, body: { error: "fetch_failed", message: msg } };
  }
  const t = await r.text();
  let body;
  try {
    body = JSON.parse(t);
  } catch {
    body = { _raw: t.slice(0, 500) };
  }
  return { status: r.status, u, body };
}

async function main() {
  console.log(`NVIBE_SMOKE_BASE=${base}\n`);

  const d = await json("/nvibe/diagnostics");
  if (d.status !== 200) {
    console.error("FAIL diagnostics", d.status, d.u, d.body);
    if (d.status === 0) {
      console.error("Is the app running? `npm run start:app` — set NVIBE_SMOKE_BASE to the embedded Vite origin (default 3001) or Koa+api.");
    }
    process.exitCode = 1;
    return;
  }
  console.log("OK diagnostics", {
    resolvedRepoRoot: d.body.resolvedRepoRoot,
    appVueExists: d.body.appVueExists,
    appBackendExists: d.body.appBackendExists,
    scribeConfigured: d.body.scribeConfigured,
  });
  if (!d.body.appVueExists || !d.body.appBackendExists) {
    console.warn("WARN: materialized files missing; open an nVibe app in the UI or GET /api/nvibe/apps/:id");
  }

  const apps = await json("/nvibe/apps");
  if (apps.status !== 200) {
    console.error("FAIL GET /api/nvibe/apps", apps.status, apps.body);
    process.exitCode = 1;
    return;
  }
  const list = apps.body?.apps;
  if (!Array.isArray(list) || list.length === 0) {
    console.warn("WARN: no apps in Scribe; create one in the UI first.");
    process.exitCode = 0;
    return;
  }

  const id = list[0].app_id;
  const one = await json(`/nvibe/apps/${encodeURIComponent(id)}`);
  if (one.status !== 200) {
    console.error("FAIL GET app", one.status, one.body);
    process.exitCode = 1;
    return;
  }
  console.log("OK GET one app", id, "backend length", (one.body?.app?.backendSource || "").length);

  const msg = await json(`/nvibe/apps/${encodeURIComponent(id)}/messages`);
  if (msg.status !== 200) {
    console.error("FAIL GET messages", msg.status, msg.body);
    process.exitCode = 1;
    return;
  }
  console.log("OK messages count", Array.isArray(msg.body?.messages) ? msg.body.messages.length : "?");

  console.log("\nDone. Re-run diagnostics after selecting an app if generated files were missing.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
