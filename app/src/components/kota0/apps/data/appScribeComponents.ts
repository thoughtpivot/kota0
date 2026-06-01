/**
 * Bundle Flight backends call Scribe **`forComponent` / `subcomponent`** with arbitrary table keys. Those rows are not
 * tied to `app_id`, so on app delete we must explicitly enumerate keys and DELETE each row via REST.
 *
 * **Product guarantee:** row-level purge for listed/inferred components. Whether **`DELETE /{component}/:id`** clears
 * internal Scribe revision/history tables, and whether empty physical Postgres tables are dropped, depends on the
 * deployed **`@spytech/scribe`** version — not asserted here. Do not use **`POST /sql`** from bundle code; platform-only
 * maintenance would be a separate, env-gated tool if required.
 */
import { isAxiosError, type AxiosInstance } from "axios";
import { normalizeScribeComponentAllPayload } from "@shared/scribeRestClient.ts";

/** Scribe component path keys Kota0 owns — never purge via bundle manifest (handled elsewhere). */
export const SCRIBE_K0_PLATFORM_FIRST_SEGMENT = new Set(["k0_app", "k0_chat_message"]);

const SEGMENT_SAFE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

function isSafeComponentPathKey(key: string): boolean {
  const trimmed = key.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return false;
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 0 || parts.length > 4) return false;
  return parts.every((p) => SEGMENT_SAFE.test(p));
}

function isPlatformReservedKey(key: string): boolean {
  const first = key.split("/")[0];
  return SCRIBE_K0_PLATFORM_FIRST_SEGMENT.has(first);
}

/** Encode a Scribe component path (`blog_posts` or `parent/child`) for URL paths. */
export function encodeScribeComponentPath(key: string): string {
  return key
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

/**
 * Extract static `forComponent('…')` / `subcomponent('a','b')` string literals from bundle backend source.
 * Dynamic component names are not detected.
 */
export function extractKota0BackendScribeKeys(backendSource: string): string[] {
  const out = new Set<string>();
  /** Optional TS generic between `forComponent` / `subcomponent` and `(`. */
  const forRe = /forComponent(?:<[\s\S]*?>)?\s*\(\s*(["'])([^"']+)\1\s*\)/g;
  const subRe = /subcomponent(?:<[\s\S]*?>)?\s*\(\s*(["'])([^"']+)\1\s*,\s*(["'])([^"']+)\3\s*\)/g;
  let m: RegExpExecArray | null;
  forRe.lastIndex = 0;
  while ((m = forRe.exec(backendSource)) !== null) {
    const name = m[2]?.trim();
    if (name && isSafeComponentPathKey(name)) out.add(name.replace(/^\/+|\/+$/g, ""));
  }
  subRe.lastIndex = 0;
  while ((m = subRe.exec(backendSource)) !== null) {
    const p = m[2]?.trim();
    const c = m[4]?.trim();
    if (p && c && isSafeComponentPathKey(p) && isSafeComponentPathKey(c)) {
      out.add(`${p.replace(/^\/+|\/+$/g, "")}/${c.replace(/^\/+|\/+$/g, "")}`);
    }
  }
  return [...out].sort();
}

/** Union manifest ∪ extracted ∪ optional extra keys; drop reserved / invalid keys. */
export function mergeScribeBundleComponentManifest(
  existing: string[] | undefined,
  extracted: string[],
  additionalKeys: string[] = [],
): string[] {
  const acc = new Set<string>();
  for (const list of [existing ?? [], extracted, additionalKeys]) {
    for (const raw of list) {
      const k = typeof raw === "string" ? raw.trim().replace(/^\/+|\/+$/g, "") : "";
      if (!k || !isSafeComponentPathKey(k) || isPlatformReservedKey(k)) continue;
      acc.add(k);
    }
  }
  return [...acc].sort();
}

/** DELETE every row Scribe exposes for this component key (GET …/all → DELETE …/:id). */
export async function purgeScribeComponentRows(client: AxiosInstance, componentPathKey: string): Promise<void> {
  if (!isSafeComponentPathKey(componentPathKey) || isPlatformReservedKey(componentPathKey)) return;
  const pathKey = encodeScribeComponentPath(componentPathKey);
  let raw: unknown;
  try {
    const res = await client.get(`/${pathKey}/all`);
    raw = res.data;
  } catch (e) {
    if (isAxiosError(e) && e.response?.status === 404) return;
    throw e;
  }
  const rows = normalizeScribeComponentAllPayload(raw);
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id !== "number" && typeof id !== "string") continue;
    const idEnc = encodeURIComponent(String(id));
    try {
      await client.delete(`/${pathKey}/${idEnc}`);
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 404) continue;
      throw e;
    }
  }
}

/** Purge all bundle-owned components (platform tables excluded). */
export async function purgeKota0BundleScribeComponents(
  client: AxiosInstance,
  keys: string[],
): Promise<void> {
  const ordered = [...new Set(keys.filter((k) => k && isSafeComponentPathKey(k) && !isPlatformReservedKey(k)))].sort();
  for (const key of ordered) {
    await purgeScribeComponentRows(client, key);
  }
}
