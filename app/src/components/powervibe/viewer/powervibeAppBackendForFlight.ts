/**
 * Flight (`node_modules/@spytech/flight`) loads `*.backend.ts` with `require()`.
 * Path aliases (e.g. `@/…`) and Vite-only specifiers (e.g. `~icons/…`) are not resolvable
 * in that path — the worker can fail to load. Enforce a Node-safe subset on PUT.
 */

/** Catch-all routes often use `/api/.../*`; @koa/router + path-to-regexp v8 requires a named segment such as `/*path`. */
export function sanitizePowervibeBackendRoutesForKoa(source: string): string {
  return source.replace(/\/api\/auth\/\*(?=["'"`])/g, "/api/auth/*path");
}

export function validatePowervibeAppBackendForFlight(
  source: string,
): { ok: true } | { ok: false; message: string } {
  const t = source.trim();
  if (t.length === 0) {
    return { ok: false, message: "App.backend.ts cannot be empty." };
  }
  if (!/\bexport\s+default\b/m.test(t)) {
    return {
      ok: false,
      message:
        'App.backend.ts must have a default export (e.g. `export default router.routes()`) for Flight. See the default in Code → Backend or Plan.backend.ts pattern.',
    };
  }
  if (/\bfrom\s*["']@\//.test(t) || /\bimport\s*\(\s*["']@\//.test(t) || /\brequire\s*\(\s*["']@\//.test(t)) {
    return {
      ok: false,
      message:
        "App.backend.ts cannot use @/ path aliases. Flight loads this file with Node require(), which does not resolve the Vite @/ prefix. Use only npm packages (e.g. @koa/router), node: built-ins, or local relative files.",
    };
  }
  if (/\bfrom\s*["']~icons\//.test(t)) {
    return {
      ok: false,
      message:
        "App.backend.ts cannot use ~icons/ imports; that is a Vite-only unplugin. Use a package import or an inline SVG in the SFC, not the Koa file.",
    };
  }
  // @koa/router uses path-to-regexp v8: bare `/api/auth/*` before a closing quote/backtick throws at registration.
  if (/\/api\/auth\/\*["'"`]/.test(t)) {
    return {
      ok: false,
      message:
        "Route path uses a bare wildcard (e.g. `/api/auth/*`). @koa/router requires `/api/auth/*path` or `router.use('/api/auth', …)`. Otherwise Flight crashes at startup.",
    };
  }
  if (/\badapter\s*:\s*\{\}\s*as\s*any\b/.test(t) || /\bdatabase\s*:\s*\{\s*adapter\s*:\s*\{\}/.test(t)) {
    return {
      ok: false,
      message:
        "Avoid empty database adapter stubs (`adapter: {} as any`, `database: { adapter: {} }`) — use a real driver (e.g. `pg` + `DATABASE_URL`) or persist via Scribe REST instead.",
    };
  }
  return { ok: true };
}
