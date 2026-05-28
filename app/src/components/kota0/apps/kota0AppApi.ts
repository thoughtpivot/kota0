/** Kota0 apps API — in dev, use same-origin `/api/*` so Vite proxies to Koa (see `app/vite.config.ts`). */

import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import { filterLegacyWelcomeFromChatMessages } from "@shared/kota0LegacyWelcome.ts";
import { sortKota0AppsByUpdatedAtDesc } from "@shared/sortKota0AppsByUpdatedAt.ts";
import {
  bucketRevisionInstantsByLocalDay,
  countHistoryRevisions,
  extractRevisionInstantsFromScribeHistoryBody,
  fillMissingRevisionInstants,
} from "@/components/kota0/ai/scribeKota0RevisionActivity";
import type { Kota0AppFull, Kota0AppStatus, Kota0AppSummary } from "./kota0AppTypes";

function koaApiPath(path: string): string {
  const explicit = (import.meta.env.VITE_KOA_ORIGIN as string | undefined)?.trim();
  if (explicit) {
    return `${explicit.replace(/\/$/, "")}${path}`;
  }
  // Development: avoid hardcoding FLIGHT_PORT — the UI is on embedded Vite; relative `/api` hits the proxy.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return path;
  }
  return path;
}

function misconfiguredVite404Message(): string {
  return (
    "Not Found (likely the browser got Vite's HTML shell instead of Koa JSON). In dev, `/api/*` must proxy to Flight on FLIGHT_PORT (see repo `.env`, typically 3000), not the embedded UI port (3001). Restart `npm run start:app`. Sanity-check GET `/api/kota0/diagnostics` in the same origin as the UI."
  );
}

/** Plain-text or HTML 404 from Koa/Vite — often a Flight worker that never reloaded `*.backend.ts`. */
function kota0BackendNotReloadedMessage(): string {
  return (
    "Kota0 route not found (HTTP 404). Restart `npm run start:app` so Koa reloads `*.backend.ts` — Flight does not hot-reload backends. " +
    "If **every** `/api/kota0/*` request 404s in dev, confirm `app/vite.config.ts` proxies `/api` to `FLIGHT_PORT` and forwards the full `/api/...` path (see README)."
  );
}

/** Prefer actionable copy: HTML body ⇒ proxy/UI origin issue; plain Not Found ⇒ stale Flight / missing `/api/kota0/*` routes. */
function refineKota0404Message(status: number, body: unknown, message: string): string {
  if (status !== 404) return message;
  if (isJsonParseFailedWrapper(body)) {
    const raw = body.raw.trim();
    if (raw.startsWith("<!DOCTYPE") || raw.startsWith("<!doctype")) {
      return misconfiguredVite404Message();
    }
    if (raw === "Not Found" || raw === "") {
      return kota0BackendNotReloadedMessage();
    }
    if (!raw.startsWith("{")) {
      return kota0BackendNotReloadedMessage();
    }
  }
  if (message === "Not Found") {
    return kota0BackendNotReloadedMessage();
  }
  return message;
}

async function parseJsonResponse(text: string): Promise<unknown> {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function isJsonParseFailedWrapper(body: unknown): body is { raw: string } {
  if (body === null || typeof body !== "object" || !("raw" in body)) return false;
  return typeof (body as { raw: unknown }).raw === "string";
}

/**
 * r.ok with a non-JSON body (HTML shell, empty) — typical when /api is not proxied to Koa.
 */
function errorIfStatusOkButBodyNotJson(r: Response, body: unknown, what: string): string | null {
  if (!r.ok || !isJsonParseFailedWrapper(body)) return null;
  const t = body.raw;
  if (t.length === 0) {
    return `Empty response from Kota0 API on ${what}. Confirm Flight is running and the dev server proxies /api to Koa (see README, GET /api/kota0/diagnostics).`;
  }
  const s = t.trim();
  if (s.startsWith("<!DOCTYPE") || s.startsWith("<!doctype")) {
    return misconfiguredVite404Message();
  }
  return `Non-JSON response from Kota0 API on ${what} (status ${r.status}). Check that requests hit Koa, not a static file. First bytes: ${s.slice(0, 120).replace(/\s+/g, " ")}${s.length > 120 ? "…" : ""}`;
}

function toFiniteNumberOrNaN(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

const DEFAULT_MATERIALIZED_VUE_PATH = "app/src/components/kota0/viewer/generated/App.vue";
const DEFAULT_MATERIALIZED_BACKEND_PATH = "app/src/components/kota0/viewer/generated/App.backend.ts";

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export type FetchKota0AppsResult =
  | { ok: true; apps: Kota0AppSummary[] }
  | { ok: false; status: number; message: string };

/** Coalesce overlapping list fetches (e.g. double mount / parallel callers). */
let fetchKota0AppsInFlight: Promise<FetchKota0AppsResult> | null = null;

export async function fetchKota0Apps(): Promise<FetchKota0AppsResult> {
  if (fetchKota0AppsInFlight) return fetchKota0AppsInFlight;
  fetchKota0AppsInFlight = doFetchKota0Apps();
  try {
    return await fetchKota0AppsInFlight;
  } finally {
    fetchKota0AppsInFlight = null;
  }
}

async function doFetchKota0Apps(): Promise<FetchKota0AppsResult> {
  const r = await fetch(koaApiPath("/api/kota0/apps"), { cache: "no-store" });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { apps?: unknown };
  if (!Array.isArray(o.apps)) {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  const apps = o.apps as Kota0AppSummary[];
  sortKota0AppsByUpdatedAtDesc(apps);
  return { ok: true, apps };
}

export async function createKota0App(
  name?: string,
): Promise<{ ok: true; app: Kota0AppFull } | { ok: false; status: number; message: string }> {
  const payload: { name?: string } = {};
  if (name !== undefined && name !== "") payload.name = name;
  const r = await fetch(koaApiPath("/api/kota0/apps"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { app?: unknown };
  const notJson = errorIfStatusOkButBodyNotJson(r, body, "POST /api/kota0/apps");
  if (notJson) {
    return { ok: false, status: r.status, message: notJson };
  }
  if (!o.app || typeof o.app !== "object") {
    return { ok: false, status: r.status, message: "invalid_api_response: missing `app` in create response" };
  }
  return { ok: true, app: o.app as Kota0AppFull };
}

export type FetchKota0AppResult =
  | { ok: true; app: Kota0AppFull }
  | { ok: false; status: number; message: string };

/** One in-flight GET per app — avoids duplicate materialize + bundle restart when callers overlap. */
const fetchKota0AppInFlight = new Map<string, Promise<FetchKota0AppResult>>();

/** Drop coalescing so the next `fetchKota0App` is a fresh request (e.g. after Apply — avoids re-awaiting a GET that started before PUT). */
export function invalidateKota0AppGetDedupe(appId: string): void {
  fetchKota0AppInFlight.delete(appId);
}

export async function fetchKota0App(appId: string): Promise<FetchKota0AppResult> {
  const existing = fetchKota0AppInFlight.get(appId);
  if (existing) return existing;
  const p = doFetchKota0App(appId);
  fetchKota0AppInFlight.set(appId, p);
  void p.finally(() => {
    if (fetchKota0AppInFlight.get(appId) === p) {
      fetchKota0AppInFlight.delete(appId);
    }
  });
  return p;
}

async function doFetchKota0App(appId: string): Promise<FetchKota0AppResult> {
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}`), {
    cache: "no-store",
  });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { app?: unknown };
  const notJson = errorIfStatusOkButBodyNotJson(r, body, "GET /api/kota0/apps/:id");
  if (notJson) {
    return { ok: false, status: r.status, message: notJson };
  }
  if (!o.app || typeof o.app !== "object") {
    return { ok: false, status: r.status, message: "invalid_api_response: missing `app` in get-app response" };
  }
  return { ok: true, app: o.app as Kota0AppFull };
}

export async function putKota0App(
  appId: string,
  payload: { source: string; backendSource: string; bundleEnv?: string },
  options?: { sourceOrigin?: "manual_code_editor" | "ai_apply" },
): Promise<
  | {
      ok: true;
      data: {
        ok: true;
        path: string;
        backendPath: string;
        bytes: number;
        backendBytes: number;
        bundleFingerprint: string;
        app: Kota0AppFull;
      };
    }
  | { ok: false; status: number; message: string }
> {
  const requestBody: { source: string; backendSource: string; bundleEnv?: string; sourceOrigin?: string } = {
    source: payload.source,
    backendSource: payload.backendSource,
  };
  if (payload.bundleEnv !== undefined) {
    requestBody.bundleEnv = payload.bundleEnv;
  }
  if (options?.sourceOrigin === "manual_code_editor") {
    requestBody.sourceOrigin = "manual_code_editor";
  } else if (options?.sourceOrigin === "ai_apply") {
    requestBody.sourceOrigin = "ai_apply";
  }
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const notJson = errorIfStatusOkButBodyNotJson(r, body, "PUT /api/kota0/apps/:id");
  if (notJson) {
    return { ok: false, status: r.status, message: notJson };
  }
  const o = body as Partial<{
    ok: boolean;
    path: string;
    backendPath: string;
    bytes: number;
    backendBytes: number;
    bundleFingerprint: string;
    app: Kota0AppFull;
  }>;
  if (o.ok !== true || !o.app || typeof o.app !== "object") {
    const miss: string[] = [];
    if (o.ok !== true) miss.push("ok");
    if (!o.app || typeof o.app !== "object") miss.push("app");
    return {
      ok: false,
      status: r.status,
      message: `invalid_api_response: PUT body missing: ${miss.join(", ")}. Restart \`npm run start:app\` if the API is stale; open GET /api/kota0/diagnostics.`,
    };
  }
  const restApp = o.app;
  const path = typeof o.path === "string" && o.path.length > 0 ? o.path : DEFAULT_MATERIALIZED_VUE_PATH;
  const backendPath =
    typeof o.backendPath === "string" && o.backendPath.length > 0 ? o.backendPath : DEFAULT_MATERIALIZED_BACKEND_PATH;
  let bytes = toFiniteNumberOrNaN(o.bytes);
  if (!Number.isFinite(bytes) && typeof restApp.source === "string") {
    bytes = utf8ByteLength(restApp.source);
  }
  let backendBytes = toFiniteNumberOrNaN(o.backendBytes);
  if (!Number.isFinite(backendBytes) && typeof restApp.backendSource === "string") {
    backendBytes = utf8ByteLength(restApp.backendSource);
  }
  if (!Number.isFinite(bytes) || !Number.isFinite(backendBytes)) {
    return {
      ok: false,
      status: r.status,
      message:
        "invalid_api_response: could not determine byte sizes; expected numeric bytes/backendBytes or app.source and app.backendSource in PUT response.",
    };
  }
  const bundleFingerprint =
    typeof o.bundleFingerprint === "string" && o.bundleFingerprint.length > 0 ? o.bundleFingerprint : "";
  return {
    ok: true,
    data: {
      ok: true,
      path,
      backendPath,
      bytes,
      backendBytes,
      bundleFingerprint,
      app: restApp,
    },
  };
}

export async function patchKota0App(
  appId: string,
  patch: { name?: string; status?: Kota0AppStatus; app_icon?: string },
): Promise<{ ok: true; app: Kota0AppFull } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { app?: unknown };
  const notJsonPatch = errorIfStatusOkButBodyNotJson(r, body, "PATCH /api/kota0/apps/:id");
  if (notJsonPatch) {
    return { ok: false, status: r.status, message: notJsonPatch };
  }
  if (!o.app || typeof o.app !== "object") {
    return { ok: false, status: r.status, message: "invalid_api_response: missing `app` in patch response" };
  }
  return { ok: true, app: o.app as Kota0AppFull };
}

export async function fetchKota0Messages(
  appId: string,
): Promise<{ ok: true; messages: ChatMessage[] } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/messages`), {
    cache: "no-store",
  });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { messages?: unknown };
  if (!Array.isArray(o.messages)) {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  const messages = o.messages.filter(
    (m): m is ChatMessage =>
      m &&
      typeof m === "object" &&
      typeof (m as ChatMessage).id === "string" &&
      ((m as ChatMessage).role === "user" ||
        (m as ChatMessage).role === "assistant" ||
        (m as ChatMessage).role === "system") &&
      typeof (m as ChatMessage).content === "string" &&
      typeof (m as ChatMessage).createdAt === "string",
  );
  return { ok: true, messages: filterLegacyWelcomeFromChatMessages(messages) };
}

export type Kota0MessageStreamHandlers = {
  onClassify?: (complex: boolean, reason: string) => void;
  onPlan?: (plan: Kota0PlanEnvelope) => void;
  onToolCall?: (tool: string, summary: string) => void;
  /** Incremental model text streamed between tool calls. Concatenate into the live assistant bubble. */
  onTextDelta?: (delta: string) => void;
  onDone: (payload: {
    messages: ChatMessage[];
    status: number;
    changed?: { source?: boolean; backend?: boolean; env?: boolean };
    bundleFingerprint?: string;
  }) => void;
  onHttpError: (status: number, message: string) => void;
  onStreamError: (message: string) => void;
};

function parseKota0WorkflowDoneBody(
  o: Record<string, unknown>,
): { ok: true; messages: ChatMessage[]; status: number; changed?: { source?: boolean; backend?: boolean; env?: boolean }; bundleFingerprint?: string } | { ok: false; message: string } {
  const rawMessages = Array.isArray(o.messages) ? (o.messages as unknown[]) : [];
  const messages = rawMessages.filter(
    (m): m is ChatMessage =>
      !!m &&
      typeof m === "object" &&
      typeof (m as ChatMessage).id === "string" &&
      typeof (m as ChatMessage).content === "string" &&
      typeof (m as ChatMessage).createdAt === "string",
  );
  const status = typeof o.status === "number" ? o.status : 200;
  let changed: { source?: boolean; backend?: boolean; env?: boolean } | undefined;
  if (o.changed && typeof o.changed === "object") {
    const c = o.changed as Record<string, unknown>;
    changed = {
      source: c.source === true,
      backend: c.backend === true,
      env: c.env === true,
    };
  }
  const bundleFingerprint =
    typeof o.bundleFingerprint === "string" && o.bundleFingerprint.length > 0
      ? o.bundleFingerprint
      : undefined;
  return { ok: true, messages: filterLegacyWelcomeFromChatMessages(messages), status, changed, bundleFingerprint };
}

/** SSE (`text/event-stream`) from `POST …/messages/stream` — workflow classify → plan → apply. */
export async function postKota0MessageStream(
  appId: string,
  text: string,
  handlers: Kota0MessageStreamHandlers,
): Promise<void> {
  const r = await fetch(
    koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/messages/stream`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ text }),
    },
  );
  if (!r.ok || !r.body) {
    const raw = await r.text();
    const body = await parseJsonResponse(raw);
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    handlers.onHttpError(r.status, message);
    return;
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = carry.indexOf("\n\n")) !== -1) {
      const block = carry.slice(0, sep);
      carry = carry.slice(sep + 2);
      for (const line of block.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        let ev: unknown;
        try {
          ev = JSON.parse(jsonStr) as unknown;
        } catch {
          continue;
        }
        if (!ev || typeof ev !== "object" || !("type" in ev)) continue;
        const o = ev as Record<string, unknown>;
        const t = o.type;
        if (t === "classify" && typeof o.complex === "boolean") {
          const reason = typeof o.reason === "string" ? o.reason : "";
          handlers.onClassify?.(o.complex, reason);
        } else if (t === "plan" && o.plan && typeof o.plan === "object") {
          const p = o.plan as Record<string, unknown>;
          if (typeof p.intent === "string" && Array.isArray(p.changes)) {
            handlers.onPlan?.(p as Kota0PlanEnvelope);
          }
        } else if (t === "tool-call" && typeof o.tool === "string") {
          const summary = typeof o.summary === "string" ? o.summary : "";
          handlers.onToolCall?.(o.tool, summary);
        } else if (t === "text-delta" && typeof o.delta === "string" && o.delta.length > 0) {
          handlers.onTextDelta?.(o.delta);
        } else if (t === "error" && typeof o.message === "string") {
          handlers.onStreamError(o.message);
          return;
        } else if (t === "done") {
          const workflowParsed = parseKota0WorkflowDoneBody(o);
          if (workflowParsed.ok) {
            handlers.onDone(workflowParsed);
            return;
          }
          handlers.onStreamError(workflowParsed.message);
          return;
        }
      }
    }
  }
  handlers.onStreamError("Stream ended before a complete reply.");
}

export async function clearKota0Messages(
  appId: string,
): Promise<{ ok: true; messages: ChatMessage[] } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/messages`), {
    method: "DELETE",
  });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { messages?: unknown };
  if (!Array.isArray(o.messages)) {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  const messages = o.messages.filter(
    (m): m is ChatMessage =>
      m &&
      typeof m === "object" &&
      typeof (m as ChatMessage).id === "string" &&
      ((m as ChatMessage).role === "user" ||
        (m as ChatMessage).role === "assistant" ||
        (m as ChatMessage).role === "system") &&
      typeof (m as ChatMessage).content === "string" &&
      typeof (m as ChatMessage).createdAt === "string",
  );
  return { ok: true, messages: filterLegacyWelcomeFromChatMessages(messages) };
}

/** Matches server `K0_TRANSCRIBE_MAX_BYTES` in geminiTranscribeAudio.ts */
const K0_TRANSCRIBE_MAX_BYTES = 8 * 1024 * 1024;

async function kota0BlobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  /** Small slices + `apply` avoids spread/call-argument limits from huge `fromCharCode(...chunks)`. */
  const chunkSize = 4096;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return btoa(binary);
}

/** POST `/api/kota0/transcribe-audio` — Gemini transcription for prompt-panel mic clips. */
export async function postKota0TranscribeAudio(
  blob: Blob,
): Promise<{ ok: true; text: string } | { ok: false; status: number; message: string }> {
  if (blob.size > K0_TRANSCRIBE_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      message: `Recording exceeds the maximum size (${Math.round(K0_TRANSCRIBE_MAX_BYTES / (1024 * 1024))} MiB). Stop sooner or try a shorter clip.`,
    };
  }
  const mimeType = blob.type?.trim() || "audio/webm";
  let audioBase64: string;
  try {
    audioBase64 = await kota0BlobToBase64(blob);
  } catch {
    return { ok: false, status: 400, message: "Could not read audio data." };
  }
  const r = await fetch(koaApiPath("/api/kota0/transcribe-audio"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioBase64, mimeType }),
  });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    if (r.status === 413) {
      message =
        `${message} Long mic clips send a large JSON body; raise Flight’s FLIGHT_PAYLOAD_LIMIT (e.g. 16mb or 64mb) and restart npm run start:app.`;
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { text?: unknown };
  const text = typeof o.text === "string" ? o.text.trim() : "";
  const notJson = errorIfStatusOkButBodyNotJson(r, body, "POST /api/kota0/transcribe-audio");
  if (notJson) {
    return { ok: false, status: r.status, message: notJson };
  }
  return { ok: true, text };
}

/** POST `/api/kota0/suggest-app-name` — AI-ish app title (server uses Gemini when configured). */
export async function fetchKota0SuggestAppName(): Promise<
  { ok: true; name: string } | { ok: false; status: number; message: string }
> {
  const r = await fetch(koaApiPath("/api/kota0/suggest-app-name"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const notJson = errorIfStatusOkButBodyNotJson(r, body, "POST /api/kota0/suggest-app-name");
  if (notJson) {
    return { ok: false, status: r.status, message: notJson };
  }
  const o = body as { name?: unknown };
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) {
    return { ok: false, status: r.status, message: "Suggest response missing name." };
  }
  return { ok: true, name };
}

export async function fetchKota0SourceRevisions(appId: string): Promise<
  | {
      ok: true;
      supported: boolean;
      path?: string;
      data?: unknown;
      tried?: string[];
      note?: string;
    }
  | { ok: false; status: number; message: string }
> {
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/source-revisions`));
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as {
    supported?: unknown;
    path?: unknown;
    data?: unknown;
    tried?: unknown;
    note?: unknown;
  };
  if (typeof o.supported !== "boolean") {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  return {
    ok: true,
    supported: o.supported,
    path: typeof o.path === "string" ? o.path : undefined,
    data: o.data,
    tried: Array.isArray(o.tried) ? (o.tried as string[]) : undefined,
    note: typeof o.note === "string" ? o.note : undefined,
  };
}

export type Kota0RevisionActivityMetrics = {
  dayLabels: string[];
  dayCounts: number[];
  days: number;
  totalRevisions: number;
  binnedRevisions: number;
  appsTotal: number;
  appsWithHistory: number;
  usedRegistryFallback: boolean;
};

/** Aggregates per-app Scribe `source` time-travel (row history) into daily buckets. */
export async function fetchKota0RevisionActivity(
  days = 14,
): Promise<
  | { ok: true; metrics: Kota0RevisionActivityMetrics }
  | { ok: false; status: number; message: string }
> {
  const d = Math.max(1, Math.min(90, days));
  const r = await fetch(
    koaApiPath(`/api/kota0/metrics/revision-activity?${new URLSearchParams({ days: String(d) })}`),
    { cache: "no-store" },
  );
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as Partial<Kota0RevisionActivityMetrics>;
  if (
    !Array.isArray(o.dayLabels) ||
    !Array.isArray(o.dayCounts) ||
    typeof o.days !== "number" ||
    typeof o.totalRevisions !== "number" ||
    typeof o.binnedRevisions !== "number" ||
    typeof o.appsTotal !== "number" ||
    typeof o.appsWithHistory !== "number" ||
    typeof o.usedRegistryFallback !== "boolean"
  ) {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  if (o.dayLabels.length !== o.dayCounts.length) {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  return { ok: true, metrics: o as Kota0RevisionActivityMetrics };
}

/**
 * Same Scribe time-travel math as the batch `/api/kota0/metrics/revision-activity` route, but calling
 * existing per-app `GET /api/kota0/apps/:id/source-revisions` n times. Use when the batch route 404s (Flight
 * does not hot-reload `*.backend.ts` — restart `start:app` to pick up new Koa paths).
 */
export async function buildRevisionActivityFromAppList(
  apps: Kota0AppSummary[],
  days: number,
): Promise<Kota0RevisionActivityMetrics> {
  const n = Math.max(1, Math.min(90, days));
  const all: Date[] = [];
  let totalRevisions = 0;
  let appsWithHistory = 0;
  let usedRegistryFallback = false;

  for (const a of apps) {
    const probe = await fetchKota0SourceRevisions(a.app_id);
    if (!probe.ok) continue;
    if (!probe.supported) continue;
    const revN = countHistoryRevisions(probe.data);
    if (revN === 0) continue;
    appsWithHistory += 1;
    totalRevisions += revN;
    const rawInstants = extractRevisionInstantsFromScribeHistoryBody(probe.data);
    const { all: withPad, usedRegistryFallback: pad } = fillMissingRevisionInstants(
      rawInstants,
      revN,
      a.updatedAt,
    );
    if (pad) usedRegistryFallback = true;
    all.push(...withPad);
  }
  const binnedRevisions = all.length;
  const { dayLabels, dayCounts } = bucketRevisionInstantsByLocalDay(all, n);
  return {
    dayLabels,
    dayCounts,
    days: n,
    totalRevisions,
    binnedRevisions,
    appsTotal: apps.length,
    appsWithHistory,
    usedRegistryFallback,
  };
}

export type Kota0PlanChange = {
  file: "App.vue" | "App.backend.ts" | ".env";
  summary: string;
  kind: "add" | "modify" | "remove" | "rewrite";
};

export type Kota0PlanEnvelope = {
  intent: string;
  /** Plain-language bullets for the plan card (no file names / code identifiers). */
  userOutline: string[];
  changes: Kota0PlanChange[];
  preserveExplicitly: string[];
  openQuestions: string[];
};

/** Mirrors `BundlePhase` in `app/src/components/kota0/deploy/kota0BundleSharedState.ts`. */
export type Kota0BundlePhase = "idle" | "installing" | "building" | "running" | "failed";

export type Kota0BundleBuildErrorKind =
  | "missing_import"
  | "vite_build_error"
  | "npm_install_error"
  | "port_conflict";

export type Kota0BundleBuildError = {
  kind: Kota0BundleBuildErrorKind;
  message: string;
  module?: string;
  importedFrom?: string;
  at: number;
};

export type Kota0BundleFlightStatus = {
  servingAppId: string | null;
  ready: boolean;
  bundleFingerprint: string | null;
  restarting: boolean;
  /** Backend bundle runner phase — drives the chain-of-thought overlay. */
  phase: Kota0BundlePhase;
  /** Epoch ms of the last phase transition. */
  phaseSince: number;
  /** Non-null only when phase is "failed" (or recently was). */
  lastBuildError: Kota0BundleBuildError | null;
};

export type Kota0BundleStatusSseEvent = {
  type: "bundle-status";
  appId: string;
  phase: Kota0BundlePhase;
  ready: boolean;
  bundleFingerprint: string | null;
  phaseSince: number;
};

const KOTA0_BUNDLE_PHASES: ReadonlySet<Kota0BundlePhase> = new Set([
  "idle",
  "installing",
  "building",
  "running",
  "failed",
]);

const KOTA0_BUILD_ERROR_KINDS: ReadonlySet<Kota0BundleBuildErrorKind> = new Set([
  "missing_import",
  "vite_build_error",
  "npm_install_error",
  "port_conflict",
]);

function coerceKota0BundlePhase(raw: unknown): Kota0BundlePhase {
  return typeof raw === "string" && KOTA0_BUNDLE_PHASES.has(raw as Kota0BundlePhase) ? (raw as Kota0BundlePhase) : "idle";
}

function coerceKota0BuildError(raw: unknown): Kota0BundleBuildError | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Kota0BundleBuildError>;
  if (typeof r.kind !== "string" || !KOTA0_BUILD_ERROR_KINDS.has(r.kind as Kota0BundleBuildErrorKind)) return null;
  if (typeof r.message !== "string") return null;
  return {
    kind: r.kind as Kota0BundleBuildErrorKind,
    message: r.message,
    module: typeof r.module === "string" ? r.module : undefined,
    importedFrom: typeof r.importedFrom === "string" ? r.importedFrom : undefined,
    at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : Date.now(),
  };
}

/**
 * POST `/api/kota0/apps/:id/preview/start` — opt-in trigger that asks the
 * workspace to materialize and spawn the bundle Flight on :4000 for this app.
 * Returns 202 immediately; the iframe polls `/bundle-flight/status` for readiness.
 */
export async function postKota0PreviewStart(
  appId: string,
): Promise<
  | { ok: true; bundleFingerprint: string }
  | { ok: false; status: number; message: string }
> {
  const r = await fetch(
    koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/preview/start`),
    { method: "POST" },
  );
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    return { ok: false, status: r.status, message: r.statusText };
  }
  const fp =
    body && typeof body === "object" && typeof (body as { bundleFingerprint?: unknown }).bundleFingerprint === "string"
      ? (body as { bundleFingerprint: string }).bundleFingerprint
      : "";
  return { ok: true, bundleFingerprint: fp };
}

/**
 * GET /api/kota0/bundle-flight/status — used by the preview iframe to confirm that
 * the singleton bundle Flight on :4000 is serving the app we asked to load, before
 * we ever construct the preview URL. Prevents app A's HTML rendering under app B's
 * URL during a rapid app switch.
 */
export async function fetchKota0BundleFlightStatus(
  appId: string,
): Promise<{ ok: true; status: Kota0BundleFlightStatus } | { ok: false; status: number; message: string }> {
  const r = await fetch(
    koaApiPath(`/api/kota0/bundle-flight/status?appId=${encodeURIComponent(appId)}`),
    { cache: "no-store" },
  );
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    return { ok: false, status: r.status, message: r.statusText };
  }
  const o = body as {
    servingAppId?: unknown;
    ready?: unknown;
    bundleFingerprint?: unknown;
    restarting?: unknown;
    phase?: unknown;
    phaseSince?: unknown;
    lastBuildError?: unknown;
  };
  const servingAppId =
    typeof o.servingAppId === "string"
      ? o.servingAppId
      : o.servingAppId === null
        ? null
        : null;
  const ready = o.ready === true;
  const bundleFingerprint =
    typeof o.bundleFingerprint === "string" && o.bundleFingerprint.length > 0 ? o.bundleFingerprint : null;
  const restarting = o.restarting === true;
  const phase = coerceKota0BundlePhase(o.phase);
  const phaseSince = typeof o.phaseSince === "number" && Number.isFinite(o.phaseSince) ? o.phaseSince : 0;
  const lastBuildError = coerceKota0BuildError(o.lastBuildError);
  return {
    ok: true,
    status: { servingAppId, ready, bundleFingerprint, restarting, phase, phaseSince, lastBuildError },
  };
}

/**
 * SSE from GET /api/kota0/bundle-flight/events — phase transitions without polling latency.
 * Returns a disposer; safe to call in browser only.
 */
export function subscribeKota0BundleFlightStatusSse(
  onEvent: (event: Kota0BundleStatusSseEvent) => void,
): () => void {
  if (typeof EventSource === "undefined") {
    return () => {};
  }
  const es = new EventSource(koaApiPath("/api/kota0/bundle-flight/events"));
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data) as { type?: unknown };
      if (data.type !== "bundle-status") return;
      const appId = typeof (data as { appId?: unknown }).appId === "string" ? (data as { appId: string }).appId : "";
      if (!appId) return;
      onEvent({
        type: "bundle-status",
        appId,
        phase: coerceKota0BundlePhase((data as { phase?: unknown }).phase),
        ready: (data as { ready?: unknown }).ready === true,
        bundleFingerprint:
          typeof (data as { bundleFingerprint?: unknown }).bundleFingerprint === "string" &&
          (data as { bundleFingerprint: string }).bundleFingerprint.length > 0
            ? (data as { bundleFingerprint: string }).bundleFingerprint
            : null,
        phaseSince:
          typeof (data as { phaseSince?: unknown }).phaseSince === "number" &&
          Number.isFinite((data as { phaseSince: number }).phaseSince)
            ? (data as { phaseSince: number }).phaseSince
            : 0,
      });
    } catch {
      /* ignore malformed frames */
    }
  };
  return () => es.close();
}

export async function duplicateKota0App(
  sourceAppId: string,
): Promise<{ ok: true; app: Kota0AppFull } | { ok: false; status: number; message: string }> {
  const r = await fetch(
    koaApiPath(`/api/kota0/apps/${encodeURIComponent(sourceAppId)}/duplicate`),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const notJson = errorIfStatusOkButBodyNotJson(r, body, "POST /api/kota0/apps/:id/duplicate");
  if (notJson) {
    return { ok: false, status: r.status, message: notJson };
  }
  const o = body as { app?: unknown };
  if (!o.app || typeof o.app !== "object") {
    return { ok: false, status: r.status, message: "invalid_api_response: missing `app` in duplicate response" };
  }
  return { ok: true, app: o.app as Kota0AppFull };
}

export async function deleteKota0App(
  appId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}`), { method: "DELETE" });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    let message =
      body && typeof body === "object" && "error" in body ?
        String((body as { error: unknown }).error)
      : r.statusText;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string" &&
      (body as { message: string }).message.trim()
    ) {
      message = (body as { message: string }).message.trim();
    }
    if (r.status === 404) {
      message = refineKota0404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  return { ok: true };
}
