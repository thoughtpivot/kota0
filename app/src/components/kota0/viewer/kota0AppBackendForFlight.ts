/**
 * Flight (`node_modules/@thoughtpivot/flight`) loads `*.backend.ts` with `require()`.
 * Path aliases (e.g. `@/…`) and Vite-only specifiers (e.g. `~icons/…`) are not resolvable
 * in that path — the worker can fail to load. Enforce a Node-safe subset on PUT.
 */

/** Ensures stable probe routes run before any duplicate AI-defined handlers (first registration wins). */
export const K0_BUNDLE_PROBE_ROUTES_MARKER = "// __k0_bundle_probe_routes_v1";

/**
 * After {@link sanitizeKota0BackendRoutesForKoa}, prepend shared hello + ai-test handlers immediately after
 * `const router = new Router();` unless {@link K0_BUNDLE_PROBE_ROUTES_MARKER} is already present (idempotent Apply).
 *
 * When the AI produces a prefixed router (`new Router({ prefix: '...' })`), probe routes
 * must live on a separate unprefixed router so `/api/kota0-app/hello` is reachable at the
 * exact path the bundle runner polls — not buried under the app's prefix.
 */
export function ensureKota0BundleProbeRoutesFirst(source: string): string {
  if (source.includes(K0_BUNDLE_PROBE_ROUTES_MARKER)) return source;

  let s = source;
  if (!s.includes("@shared/kota0BundlePlatformAiRoutes")) {
    s =
      `import { registerKota0BundleHelloRoute, registerKota0BundleAiTestRoute } from "@shared/kota0BundlePlatformAiRoutes";\n` +
      s;
  }

  // Case 1: unprefixed router — register probe routes directly (original path)
  const unprefixedDecl = /const\s+router\s*=\s*new\s+Router\s*\(\s*\)\s*;/m;
  const mUnprefixed = unprefixedDecl.exec(s);
  if (mUnprefixed) {
    const hook = `${K0_BUNDLE_PROBE_ROUTES_MARKER}\nregisterKota0BundleHelloRoute(router);\nregisterKota0BundleAiTestRoute(router);\n`;
    const idx = mUnprefixed.index + mUnprefixed[0].length;
    return s.slice(0, idx) + "\n" + hook + s.slice(idx);
  }

  // Case 2: prefixed router — probe routes need their own unprefixed router
  // composed via a parent Router so the export has `.router` (required by
  // Flight's `router.use(serverRoutes.default)` — @koa/router only copies
  // nested routes when `.router` is present on the middleware).
  const prefixedDecl = /const\s+router\s*=\s*new\s+Router\s*\(\s*\{[^}]*\}\s*\)\s*;/m;
  const mPrefixed = prefixedDecl.exec(s);
  if (mPrefixed) {
    const probeBlock =
      `\n${K0_BUNDLE_PROBE_ROUTES_MARKER}\n` +
      `const __k0Probe = new Router();\n` +
      `registerKota0BundleHelloRoute(__k0Probe);\n` +
      `registerKota0BundleAiTestRoute(__k0Probe);\n`;
    const idx = mPrefixed.index + mPrefixed[0].length;
    s = s.slice(0, idx) + probeBlock + s.slice(idx);

    s = s.replace(
      /export\s+default\s+router\.routes\s*\(\s*\)\s*;/,
      `const __k0Root = new Router();\n` +
      `__k0Root.use(__k0Probe.routes(), __k0Probe.allowedMethods());\n` +
      `__k0Root.use(router.routes(), router.allowedMethods());\n` +
      `export default __k0Root.routes();`,
    );
    return s;
  }

  // Fallback: no recognised declaration; insert before export
  const hook = `${K0_BUNDLE_PROBE_ROUTES_MARKER}\nregisterKota0BundleHelloRoute(router);\nregisterKota0BundleAiTestRoute(router);\n`;
  return s.replace(/export\s+default\s+router\.routes\s*\(\s*\)\s*;/, `${hook}\nexport default router.routes();`);
}

/** Catch-all routes often use `/api/.../*`; @koa/router + path-to-regexp v8 requires a named segment such as `/*path`. */
export function sanitizeKota0BackendRoutesForKoa(source: string): string {
  return source.replace(/\/api\/auth\/\*(?=["'"`])/g, "/api/auth/*path");
}

/**
 * Models often emit a standalone Koa app (`export const app = new Koa(); app.use(router.routes())`).
 * Bundle Flight expects `export default router.routes()` — without it, no routes load and hello 404s.
 */
export function coerceKoaAppExportToRouterDefault(source: string): string {
  let s = source;
  const usesKoaApp =
    /\bnew\s+Koa\s*\(\s*\)/.test(s) ||
    /^\s*app\.use\s*\(\s*router\.(?:routes|allowedMethods)\s*\(\s*\)\s*\)/m.test(s);
  if (!usesKoaApp) return s;

  s = s.replace(/^import\s+Koa\s+from\s+['"]koa['"];\s*\r?\n?/gm, "");
  s = s.replace(/^export\s+const\s+app\s*=\s*new\s+Koa\s*\(\s*\)\s*;\s*\r?\n?/gm, "");
  s = s.replace(/^const\s+app\s*=\s*new\s+Koa\s*\(\s*\)\s*;\s*\r?\n?/gm, "");
  s = s.replace(/^\s*app\.use\s*\(\s*router\.routes\s*\(\s*\)\s*\)\s*;\s*\r?\n?/gm, "");
  s = s.replace(/^\s*app\.use\s*\(\s*router\.allowedMethods\s*\(\s*\)\s*\)\s*;\s*\r?\n?/gm, "");

  if (!/\bexport\s+default\b/m.test(s) && /const\s+router\s*=\s*new\s+Router/m.test(s)) {
    s = `${s.trimEnd()}\n\nexport default router.routes();\n`;
  }
  return s;
}

/**
 * `export default router` (bare Router object) crashes Flight — it expects `router.routes()` (a middleware function).
 * Append `.routes()` when the default export is the router variable itself.
 */
export function coerceBareRouterExportToRoutes(source: string): string {
  return source.replace(
    /\bexport\s+default\s+router\s*;/g,
    "export default router.routes();",
  );
}

/** Sanitize + coerce AI backend output before Scribe persist or bundle materialize. */
export function normalizeKota0AppBackendForFlight(source: string): string {
  let s = sanitizeKota0BackendRoutesForKoa(source);
  s = coerceKoaAppExportToRouterDefault(s);
  s = coerceBareRouterExportToRoutes(s);
  return s;
}

export function validateKota0AppBackendForFlight(
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
        'App.backend.ts must have a default export (e.g. `export default router.routes()`) for Flight. See the default in Code → Backend or templates/k0-bundle/App.backend.ts.',
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
