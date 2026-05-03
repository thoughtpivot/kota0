/**
 * Typed axios helpers for `@spytech/scribe` HTTP API. Use from bundle `App.backend.ts` via
 * `import { createScribeRestClient } from '@shared/scribeRestClient'` (Flight + tsconfig-paths).
 */
import axios, { type AxiosInstance } from "axios";
import {
  type BuildScribeRowEnvelopeOptions,
  type ScribeRowEnvelope,
  buildScribeRowEnvelope,
} from "@shared/scribeRowEnvelope.ts";

/**
 * Browser-safe Docker hint — **do not** use `node:fs` here: powervibe bundle `vite build` may tree-shake this module into
 * client chunks, and Rollup cannot resolve Node builtins there.
 *
 * For Compose: set `SCRIBE_URL=http://scribe:1337`, or set `RUNNING_IN_DOCKER=1` / `DOCKER=true` when `SCRIBE_URL` still
 * points at localhost so we rewrite to `http://scribe:1337`.
 */
function runningInDocker(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  const e = process.env;
  return e.DOCKER === "true" || e.RUNNING_IN_DOCKER === "1";
}

/** Same rules as platform `@/lib/scribe`: host dev default, Docker rewrite, `SCRIBE_URL` override. */
export function resolveScribeBaseUrlFromEnv(): string {
  const fromEnv = process.env.SCRIBE_URL?.trim() ?? "";
  if (runningInDocker() && (fromEnv === "" || /\blocalhost\b|127\.0\.0\.1/.test(fromEnv))) {
    return "http://scribe:1337";
  }
  if (fromEnv !== "") {
    return fromEnv.replace(/\/$/, "");
  }
  return "http://127.0.0.1:1337";
}

export type ScribeRestClientConfig = {
  /** Defaults to {@link resolveScribeBaseUrlFromEnv}. */
  baseURL?: string;
  timeoutMs?: number;
  /** Applied to {@link buildScribeRowEnvelope} on create unless overridden per call. */
  actors?: { created_by: number; modified_by: number };
};

function pathSegments(url: string): string[] {
  const u = url.replace(/^\/+/, "");
  if (!u) return [];
  return u.split("/").filter(Boolean);
}

/**
 * Whether `POST`/`PUT` on this path expects a Scribe **row envelope** body (`default.table.schema.json`).
 * Skips `POST /{component}/all` (filter payloads), `POST /sql`, etc.
 */
export function shouldValidateScribeWriteEnvelope(method: string, urlPath: string): boolean {
  if (process.env.SCRIBE_SKIP_ROW_ENVELOPE_VALIDATION === "1") return false;
  let path = urlPath;
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      /* keep path */
    }
  }
  const m = method.toLowerCase();
  const parts = pathSegments(path);
  if (m === "post") {
    if (parts.length === 1 && parts[0] !== "sql") return true;
    if (parts.length === 2 && parts[1] !== "all") return true;
    return false;
  }
  if (m === "put") {
    return parts.length === 2 || parts.length === 3;
  }
  return false;
}

function enc(segment: string): string {
  return encodeURIComponent(segment);
}

/**
 * Unwraps Scribe `GET …/all` payloads: some deployments return a bare array, others `{ data: Row[] }`.
 * Does not alter individual rows (see {@link unwrapLegacyDoubledRowDomain}).
 */
export function normalizeScribeComponentAllPayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && "data" in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: unknown[] }).data;
  }
  return [];
}

/**
 * Unwraps a single-resource GET body when Scribe nests the row under `{ data: row }`.
 */
export function normalizeScribeSingleRowPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  if ("data" in o && o.data && typeof o.data === "object" && !Array.isArray(o.data)) {
    const inner = o.data as Record<string, unknown>;
    if (typeof inner.id === "number") return inner;
  }
  return raw;
}

function looksLikeScribeRowEnvelope(o: Record<string, unknown>): boolean {
  return (
    "data" in o &&
    "date_created" in o &&
    "date_modified" in o &&
    "created_by" in o &&
    "modified_by" in o &&
    typeof o.data === "object" &&
    o.data !== null &&
    !Array.isArray(o.data)
  );
}

/**
 * Fixes rows where domain was double-wrapped (`posts.create(buildScribeRowEnvelope(...))`).
 * Golden path: pass plain domain to `create()` only.
 */
export function unwrapLegacyDoubledRowDomain(row: unknown): unknown {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const r = row as Record<string, unknown>;
  const inner = r.data;
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return row;
  const bag = inner as Record<string, unknown>;
  const nested = bag.data;
  const hasInnerEnvelope =
    typeof bag.date_created === "string" &&
    typeof bag.date_modified === "string" &&
    typeof bag.created_by === "number" &&
    typeof bag.modified_by === "number" &&
    nested !== null &&
    typeof nested === "object" &&
    !Array.isArray(nested);
  if (!hasInnerEnvelope) return row;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[scribeRestClient] Normalized legacy double-wrapped row.data (pass domain fields to forComponent().create only; do not wrap with buildScribeRowEnvelope).",
    );
  }
  return { ...r, data: nested };
}

function mapRows(rawList: unknown[]): unknown[] {
  return rawList.map((row) => unwrapLegacyDoubledRowDomain(row));
}

export type ScribeComponentApi<TData extends Record<string, unknown>> = {
  listAll: () => Promise<unknown>;
  getById: (id: string | number) => Promise<unknown>;
  create: (domain: TData, opts?: BuildScribeRowEnvelopeOptions) => Promise<unknown>;
  replace: (id: string | number, envelope: ScribeRowEnvelope) => Promise<unknown>;
  deleteById: (id: string | number) => Promise<unknown>;
  /** Alias for {@link deleteById} — AI-generated backends often call `.delete(id)`. */
  delete: (id: string | number) => Promise<unknown>;
};

/** Shape returned by {@link createScribeRestClient}; `get`/`post`/… delegate to the underlying axios instance for backward-compatible AI snippets. */
export type CreatedScribeRestClient = {
  axios: AxiosInstance;
  baseURL: string;
  forComponent: <TData extends Record<string, unknown>>(component: string) => ScribeComponentApi<TData>;
  subcomponent: <TData extends Record<string, unknown>>(
    parent: string,
    child: string,
  ) => ScribeComponentApi<TData>;
  get: AxiosInstance["get"];
  post: AxiosInstance["post"];
  put: AxiosInstance["put"];
  delete: AxiosInstance["delete"];
  patch: AxiosInstance["patch"];
};

/** @param config - omit for env base URL, or pass a base URL string, or a full config object. */
export function createScribeRestClient(config?: string | ScribeRestClientConfig): CreatedScribeRestClient {
  const opts: ScribeRestClientConfig = typeof config === "string" ? { baseURL: config } : (config ?? {});
  const baseURL = (opts.baseURL ?? resolveScribeBaseUrlFromEnv()).replace(/\/$/, "");
  const actorDefaults = opts.actors ?? { created_by: 0, modified_by: 0 };
  const http = axios.create({
    baseURL,
    timeout: opts.timeoutMs ?? 60_000,
    headers: { "Content-Type": "application/json" },
  });

  function forComponent<TData extends Record<string, unknown>>(component: string): ScribeComponentApi<TData> {
    const c = component.replace(/^\/+|\/+$/g, "");
    return {
      listAll: async () => {
        const raw = (await http.get(`/${enc(c)}/all`)).data as unknown;
        return mapRows(normalizeScribeComponentAllPayload(raw));
      },
      getById: async (id: string | number) => {
        const raw = (await http.get(`/${enc(c)}/${enc(String(id))}`)).data as unknown;
        return unwrapLegacyDoubledRowDomain(normalizeScribeSingleRowPayload(raw));
      },
      create: async (domain: TData, opts?: BuildScribeRowEnvelopeOptions) => {
        const d = domain as Record<string, unknown>;
        if (looksLikeScribeRowEnvelope(d)) {
          throw new Error(
            "scribeRestClient: forComponent().create() expects plain domain fields only (e.g. { title, content }). " +
              "Do not pass buildScribeRowEnvelope(...) or a full row envelope — the client builds the envelope.",
          );
        }
        const body = buildScribeRowEnvelope(d, {
          ...actorDefaults,
          ...opts,
        });
        return unwrapLegacyDoubledRowDomain(
          normalizeScribeSingleRowPayload((await http.post(`/${enc(c)}`, body)).data as unknown),
        );
      },
      replace: async (id: string | number, envelope: ScribeRowEnvelope) =>
        (await http.put(`/${enc(c)}/${enc(String(id))}`, envelope)).data as unknown,
      deleteById: async (id: string | number) =>
        (await http.delete(`/${enc(c)}/${enc(String(id))}`)).data as unknown,
      delete: async (id: string | number) =>
        (await http.delete(`/${enc(c)}/${enc(String(id))}`)).data as unknown,
    };
  }

  function subcomponent<TData extends Record<string, unknown>>(
    parent: string,
    child: string,
  ): ScribeComponentApi<TData> {
    const p = parent.replace(/^\/+|\/+$/g, "");
    const ch = child.replace(/^\/+|\/+$/g, "");
    return {
      listAll: async () => {
        const raw = (await http.get(`/${enc(p)}/${enc(ch)}/all`)).data as unknown;
        return mapRows(normalizeScribeComponentAllPayload(raw));
      },
      getById: async (id: string | number) => {
        const raw = (await http.get(`/${enc(p)}/${enc(ch)}/${enc(String(id))}`)).data as unknown;
        return unwrapLegacyDoubledRowDomain(normalizeScribeSingleRowPayload(raw));
      },
      create: async (domain: TData, opts?: BuildScribeRowEnvelopeOptions) => {
        const d = domain as Record<string, unknown>;
        if (looksLikeScribeRowEnvelope(d)) {
          throw new Error(
            "scribeRestClient: subcomponent().create() expects plain domain fields only. " +
              "Do not pass buildScribeRowEnvelope(...) or a full row envelope.",
          );
        }
        const body = buildScribeRowEnvelope(d, {
          ...actorDefaults,
          ...opts,
        });
        return unwrapLegacyDoubledRowDomain(
          normalizeScribeSingleRowPayload((await http.post(`/${enc(p)}/${enc(ch)}`, body)).data as unknown),
        );
      },
      replace: async (id: string | number, envelope: ScribeRowEnvelope) =>
        (await http.put(`/${enc(p)}/${enc(ch)}/${enc(String(id))}`, envelope)).data as unknown,
      deleteById: async (id: string | number) =>
        (await http.delete(`/${enc(p)}/${enc(ch)}/${enc(String(id))}`)).data as unknown,
      delete: async (id: string | number) =>
        (await http.delete(`/${enc(p)}/${enc(ch)}/${enc(String(id))}`)).data as unknown,
    };
  }

  return {
    axios: http,
    baseURL,
    forComponent,
    subcomponent,
    get: http.get.bind(http),
    post: http.post.bind(http),
    put: http.put.bind(http),
    delete: http.delete.bind(http),
    patch: http.patch.bind(http),
  };
}
