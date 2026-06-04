/**
 * Canonical Scribe usage for bundle `App.backend.ts` — shared by apply prompts and
 * pre-persist validation so the model cannot treat Scribe as Redis/KV.
 */

/** Injected into the apply-agent system prompt whenever backend work is likely. */
export const KOTA0_SCRIBE_BACKEND_CONTRACT =
  "**Scribe persistence (`App.backend.ts`):** `createScribeRestClient()` is a **REST table client**, not Redis/KV. " +
  "**Never** `scribe.get('some_key')`, `scribe.set(...)`, or `JSON.parse` on a Scribe response body as if it were a string. " +
  "**Always** `const table = scribe.forComponent<{ …fields }>('component_name')` then `listAll()`, `create(domainFields)`, `getById(id)`, `replace(id, buildScribeRowEnvelope(...))`. " +
  "Import `buildScribeRowEnvelope` from `@shared/scribeRowEnvelope` for updates. " +
  "Mirror the working **`k0_demo_greetings`** pattern in the starter backend (`getCurrentSource` → App.backend.ts). " +
  "`App.vue` never imports Scribe — only `fetch(bundleApiUrl('api/…'))` to your Koa routes. " +
  "Register `router.use(bodyParser())` immediately after `const router = new Router()` when routes read `ctx.request.body`.";

/**
 * Returns a human-readable rejection reason when generated backend source misuses Scribe.
 */
export function detectInvalidBundleScribeUsage(source: string): string | null {
  if (/\bscribe\.set\s*\(/.test(source)) {
    return (
      "App.backend.ts uses scribe.set(...) — that method does not exist. " +
      "Use scribe.forComponent('name').create(...) or .replace(id, buildScribeRowEnvelope(...))."
    );
  }

  const bareGet = /\bscribe\.get\s*\(\s*(["'`])([^"'`/][^"'`]*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = bareGet.exec(source)) !== null) {
    return (
      `App.backend.ts uses scribe.get('${m[2]}') as a key-value lookup — Scribe is REST, not Redis. ` +
      "Use scribe.forComponent('table_name').listAll() / .getById(id), or scribe.get('/component/all') with a leading slash."
    );
  }

  if (/\bcreateScribeRestClient\s*\(/.test(source)) {
    const hasTableApi = /\bforComponent\s*\(/.test(source) || /\bsubcomponent\s*\(/.test(source);
    const mutatesApi =
      /\brouter\.(?:post|put|delete|patch)\s*\(\s*["'`]\/api\//.test(source) ||
      /\brouter\.(?:post|put|delete|patch)\s*\(\s*["'`]api\//.test(source);
    if (mutatesApi && !hasTableApi) {
      return (
        "App.backend.ts calls createScribeRestClient() and defines mutating /api routes but never uses " +
        "scribe.forComponent(...) or scribe.subcomponent(...). Add a Scribe component table and CRUD via forComponent."
      );
    }
  }

  return null;
}
