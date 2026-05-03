/**
 * Flight (`node_modules/@thoughtpivot/flight`) loads `*.backend.ts` with `require()`.
 * Path aliases (e.g. `@/…`) and Vite-only specifiers (e.g. `~icons/…`) are not resolvable
 * in that path — the worker can fail to load. Enforce a Node-safe subset on PUT.
 */

/** Ensures stable probe routes run before any duplicate AI-defined handlers (first registration wins). */
export const POWERVIBE_BUNDLE_PROBE_ROUTES_MARKER = "// __powervibe_bundle_probe_routes_v1";

/**
 * After {@link sanitizePowervibeBackendRoutesForKoa}, prepend shared hello + ai-test handlers immediately after
 * `const router = new Router();` unless {@link POWERVIBE_BUNDLE_PROBE_ROUTES_MARKER} is already present (idempotent Apply).
 */
export function ensurePowervibeBundleProbeRoutesFirst(source: string): string {
  if (source.includes(POWERVIBE_BUNDLE_PROBE_ROUTES_MARKER)) return source;

  let s = source;
  if (!s.includes("@shared/powervibeBundlePlatformAiRoutes")) {
    s =
      `import { registerPowervibeBundleHelloRoute, registerPowervibeBundleAiTestRoute } from "@shared/powervibeBundlePlatformAiRoutes";\n` +
      s;
  }

  const hook = `${POWERVIBE_BUNDLE_PROBE_ROUTES_MARKER}\nregisterPowervibeBundleHelloRoute(router);\nregisterPowervibeBundleAiTestRoute(router);\n`;

  const routerDecl = /const\s+router\s*=\s*new\s+Router\s*\(\s*\)\s*;/m;
  const m = routerDecl.exec(s);
  if (m) {
    const idx = m.index + m[0].length;
    return s.slice(0, idx) + "\n" + hook + s.slice(idx);
  }

  return s.replace(/export\s+default\s+router\.routes\s*\(\s*\)\s*;/, `${hook}\nexport default router.routes();`);
}

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
  // `@google/genai` exports `GoogleGenAI`, not `GoogleGenerativeAI` / `getGenerativeModel` (legacy tutorial APIs).
  if (/@google\/genai/.test(t) && /\bGoogleGenerativeAI\b/.test(t)) {
    return {
      ok: false,
      message:
        "`GoogleGenerativeAI` is not exported from `@google/genai` (runtime: “not a constructor”). Use `import { GoogleGenAI } from \"@google/genai\"`, `new GoogleGenAI({ apiKey })`, and `await ai.models.generateContent({ model, contents })`; read `response.text`.",
    };
  }
  if (/\bgetGenerativeModel\s*\(/.test(t)) {
    return {
      ok: false,
      message:
        "`getGenerativeModel()` is from the legacy JavaScript SDK. With `@google/genai`, use `new GoogleGenAI({ apiKey })` and `ai.models.generateContent({ model, contents: [{ role: \"user\", parts: [{ text }] }] })`.",
    };
  }
  return { ok: true };
}
