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

export type Kota0LastTurnPayload = {
  proposedAppVue: string | null;
  proposedAppBackend: string | null;
  proposedBundleEnv: string | null;
};

function parseKota0PostSuccessBody(o: {
  messages?: unknown;
  usedStub?: unknown;
  lastKota0Turn?: unknown;
}):
  | { ok: true; messages: ChatMessage[]; usedStub: boolean; lastKota0Turn: Kota0LastTurnPayload }
  | { ok: false; message: string } {
  if (!Array.isArray(o.messages) || typeof o.usedStub !== "boolean") {
    return { ok: false, message: "invalid_response" };
  }
  const lt = o.lastKota0Turn;
  const lastKota0Turn: Kota0LastTurnPayload = {
    proposedAppVue: null,
    proposedAppBackend: null,
    proposedBundleEnv: null,
  };
  if (lt && typeof lt === "object" && lt !== null) {
    const p = (lt as { proposedAppVue?: unknown }).proposedAppVue;
    if (typeof p === "string") lastKota0Turn.proposedAppVue = p;
    else if (p === null) lastKota0Turn.proposedAppVue = null;
    const b = (lt as { proposedAppBackend?: unknown }).proposedAppBackend;
    if (typeof b === "string") lastKota0Turn.proposedAppBackend = b;
    else if (b === null) lastKota0Turn.proposedAppBackend = null;
    const e = (lt as { proposedBundleEnv?: unknown }).proposedBundleEnv;
    if (typeof e === "string") lastKota0Turn.proposedBundleEnv = e;
    else if (e === null) lastKota0Turn.proposedBundleEnv = null;
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
  return {
    ok: true,
    messages: filterLegacyWelcomeFromChatMessages(messages),
    usedStub: o.usedStub,
    lastKota0Turn,
  };
}

export async function postKota0Message(
  appId: string,
  text: string,
): Promise<
  | { ok: true; messages: ChatMessage[]; usedStub: boolean; lastKota0Turn: Kota0LastTurnPayload }
  | { ok: false; status: number; message: string }
> {
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/messages`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
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
  const o = body as { messages?: unknown; usedStub?: unknown; lastKota0Turn?: unknown };
  const parsed = parseKota0PostSuccessBody(o);
  if (!parsed.ok) {
    return { ok: false, status: r.status, message: parsed.message };
  }
  return { ok: true, messages: parsed.messages, usedStub: parsed.usedStub, lastKota0Turn: parsed.lastKota0Turn };
}

export type Kota0MessageStreamHandlers = {
  onDelta?: (receivedChars: number, textDelta: string) => void;
  onClassify?: (complex: boolean, reason: string) => void;
  onPlan?: () => void;
  onToolCall?: (tool: string, summary: string) => void;
  onDone: (payload: {
    messages: ChatMessage[];
    status: number;
    changed?: { source?: boolean; backend?: boolean; env?: boolean };
    bundleFingerprint?: string;
    usedStub?: boolean;
    lastKota0Turn?: Kota0LastTurnPayload;
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
        if (t === "delta" && typeof o.receivedChars === "number" && handlers.onDelta) {
          const textDelta = typeof o.text === "string" ? o.text : "";
          handlers.onDelta(o.receivedChars, textDelta);
        } else if (t === "classify" && typeof o.complex === "boolean") {
          const reason = typeof o.reason === "string" ? o.reason : "";
          handlers.onClassify?.(o.complex, reason);
        } else if (t === "plan") {
          handlers.onPlan?.();
        } else if (t === "tool-call" && typeof o.tool === "string") {
          const summary = typeof o.summary === "string" ? o.summary : "";
          handlers.onToolCall?.(o.tool, summary);
        } else if (t === "error" && typeof o.message === "string") {
          handlers.onStreamError(o.message);
          return;
        } else if (t === "done") {
          const workflowParsed = parseKota0WorkflowDoneBody(o);
          if (workflowParsed.ok) {
            handlers.onDone(workflowParsed);
            return;
          }
          const ideationParsed = parseKota0PostSuccessBody(o);
          if (!ideationParsed.ok) {
            handlers.onStreamError(ideationParsed.message);
            return;
          }
          handlers.onDone({
            messages: ideationParsed.messages,
            status: 200,
            usedStub: ideationParsed.usedStub,
            lastKota0Turn: ideationParsed.lastKota0Turn,
          });
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
  changes: Kota0PlanChange[];
  preserveExplicitly: string[];
  openQuestions: string[];
};

/** Precomputed file contents from ideation fences — skips the LLM agent loop on apply. */
export type Kota0ProposedSources = {
  source?: string;
  backendSource?: string;
  bundleEnv?: string;
};

export type Kota0ApplyStreamOpts = {
  confirmationText?: string;
  proposedSources?: Kota0ProposedSources;
};

export type Kota0PlanResult =
  | { ok: true; plan: Kota0PlanEnvelope; messages: ChatMessage[]; usedStub: boolean }
  | { ok: false; status: number; message: string };

/**
 * POST `/api/kota0/apps/:id/plan` — runs the plan turn. The server persists the user's
 * message and the plan envelope (`kind: "plan"`) before returning. `freshStart=true`
 * tells the model to ignore prior chat context.
 */
export async function postKota0Plan(
  appId: string,
  text: string,
  freshStart: boolean,
): Promise<Kota0PlanResult> {
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/plan`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, freshStart }),
  });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : r.statusText;
    return { ok: false, status: r.status, message };
  }
  const o = body as { ok?: unknown; plan?: unknown; messages?: unknown; reason?: unknown };
  if (!o.plan || typeof o.plan !== "object") {
    return { ok: false, status: r.status, message: "invalid_plan_response" };
  }
  if (!Array.isArray(o.messages)) {
    return { ok: false, status: r.status, message: "invalid_plan_response" };
  }
  const messages = o.messages.filter(
    (m): m is ChatMessage =>
      m &&
      typeof m === "object" &&
      typeof (m as ChatMessage).id === "string" &&
      typeof (m as ChatMessage).content === "string" &&
      typeof (m as ChatMessage).createdAt === "string",
  );
  return {
    ok: true,
    plan: o.plan as Kota0PlanEnvelope,
    messages: filterLegacyWelcomeFromChatMessages(messages),
    usedStub: o.ok === false,
  };
}

export type Kota0ApplyResult =
  | {
      ok: true;
      changed: { source: boolean; backend: boolean; env: boolean };
      fallbacks: { file: string; reason: string; detail: string }[];
      messages: ChatMessage[];
      bundleFingerprint: string;
    }
  | { ok: false; status: number; message: string };

/**
 * POST `/api/kota0/apps/:id/apply` — runs the apply turn for an accepted plan. Server
 * parses patches, applies them to current HEAD, persists the new source, and returns
 * which files changed plus any patch-fallback reasons (anchor not found, etc.).
 */
export async function postKota0Apply(
  appId: string,
  plan: Kota0PlanEnvelope,
  opts?: Kota0ApplyStreamOpts,
): Promise<Kota0ApplyResult> {
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/apply`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan,
      ...(opts?.confirmationText ? { confirmationText: opts.confirmationText } : {}),
      ...(opts?.proposedSources ? { proposedSources: opts.proposedSources } : {}),
    }),
  });
  const body = await parseJsonResponse(await r.text());
  if (!r.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : r.statusText;
    return { ok: false, status: r.status, message };
  }
  const o = body as { ok?: unknown; changed?: unknown; fallbacks?: unknown; messages?: unknown; bundleFingerprint?: unknown };
  if (!Array.isArray(o.messages)) {
    return { ok: false, status: r.status, message: "invalid_apply_response" };
  }
  const messages = o.messages.filter(
    (m): m is ChatMessage =>
      m &&
      typeof m === "object" &&
      typeof (m as ChatMessage).id === "string" &&
      typeof (m as ChatMessage).content === "string" &&
      typeof (m as ChatMessage).createdAt === "string",
  );
  const changedRaw = o.changed && typeof o.changed === "object" ? (o.changed as Record<string, unknown>) : {};
  const changed = {
    source: changedRaw.source === true,
    backend: changedRaw.backend === true,
    env: changedRaw.env === true,
  };
  const fallbacks = Array.isArray(o.fallbacks)
    ? (o.fallbacks as { file?: unknown; reason?: unknown; detail?: unknown }[])
        .filter((f) => typeof f.file === "string" && typeof f.reason === "string" && typeof f.detail === "string")
        .map((f) => ({ file: f.file as string, reason: f.reason as string, detail: f.detail as string }))
    : [];
  const bundleFingerprint =
    typeof o.bundleFingerprint === "string" && o.bundleFingerprint.length > 0 ? o.bundleFingerprint : "";
  return {
    ok: true,
    changed,
    fallbacks,
    bundleFingerprint,
    messages: filterLegacyWelcomeFromChatMessages(messages),
  };
}

export type Kota0ApplyStreamHandlers = {
  /** Called for each tool the agent loop invokes, BEFORE the tool runs. */
  onToolCall: (tool: string, summary: string) => void;
  /** Final response — same shape as postKota0Apply success / failure body, with `status` indicating HTTP status. */
  onDone: (payload: { status: number; body: Record<string, unknown> }) => void;
  onHttpError: (status: number, message: string) => void;
  onStreamError: (message: string) => void;
};

/**
 * SSE variant of `postKota0Apply`. The server streams `{ type: "tool-call", tool, summary }`
 * frames as the agent loop invokes each tool, then a single `{ type: "done", status, ...body }`
 * frame (or `{ type: "error", message }`). Useful for showing a live trace in the chat UI.
 */
export async function postKota0ApplyStream(
  appId: string,
  plan: Kota0PlanEnvelope,
  handlers: Kota0ApplyStreamHandlers,
  opts?: Kota0ApplyStreamOpts,
): Promise<void> {
  const r = await fetch(
    koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/apply/stream`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        plan,
        ...(opts?.confirmationText ? { confirmationText: opts.confirmationText } : {}),
        ...(opts?.proposedSources ? { proposedSources: opts.proposedSources } : {}),
      }),
    },
  );
  if (!r.ok || !r.body) {
    const raw = await r.text();
    const body = await parseJsonResponse(raw);
    let message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
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
        if (t === "tool-call" && typeof o.tool === "string") {
          const summary = typeof o.summary === "string" ? o.summary : "";
          handlers.onToolCall(o.tool, summary);
        } else if (t === "error" && typeof o.message === "string") {
          handlers.onStreamError(o.message);
          return;
        } else if (t === "done") {
          const status =
            typeof o.status === "number" ? o.status : 200;
          // Strip {type, status} from the payload — leave only the response body shape the caller expects.
          const bodyOut: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(o)) {
            if (k === "type" || k === "status") continue;
            bodyOut[k] = v;
          }
          handlers.onDone({ status, body: bodyOut });
          return;
        }
      }
    }
  }
  handlers.onStreamError("Stream ended before a complete reply.");
}

export type Kota0BundleFlightStatus = {
  servingAppId: string | null;
  ready: boolean;
  bundleFingerprint: string | null;
  restarting: boolean;
};

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
  const o = body as { servingAppId?: unknown; ready?: unknown; bundleFingerprint?: unknown; restarting?: unknown };
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
  return { ok: true, status: { servingAppId, ready, bundleFingerprint, restarting } };
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
