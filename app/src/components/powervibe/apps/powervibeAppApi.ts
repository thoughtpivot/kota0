/** PowerVibe apps API — in dev, use same-origin `/api/*` so Vite proxies to Koa (see `app/vite.config.ts`). */

import type { ChatMessage } from "@/components/powervibe/ai/chat.types";
import { filterLegacyWelcomeFromChatMessages } from "@shared/powervibeLegacyWelcome.ts";
import { sortPowervibeAppsByUpdatedAtDesc } from "@shared/sortPowervibeAppsByUpdatedAt.ts";
import {
  bucketRevisionInstantsByLocalDay,
  countHistoryRevisions,
  extractRevisionInstantsFromScribeHistoryBody,
  fillMissingRevisionInstants,
} from "@/components/powervibe/ai/scribePowervibeRevisionActivity";
import type { PowervibeAppFull, PowervibeAppStatus, PowervibeAppSummary } from "./powervibeAppTypes";

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
    "Not Found (likely the browser got Vite's HTML shell instead of Koa JSON). In dev, `/api/*` must proxy to Flight on FLIGHT_PORT (see repo `.env`, typically 3000), not the embedded UI port (3001). Restart `npm run start:app`. Sanity-check GET `/api/powervibe/diagnostics` in the same origin as the UI."
  );
}

/** Plain-text or HTML 404 from Koa/Vite — often a Flight worker that never reloaded `*.backend.ts`. */
function powervibeBackendNotReloadedMessage(): string {
  return (
    "PowerVibe route not found (HTTP 404). Restart `npm run start:app` so Koa reloads `*.backend.ts` — Flight does not hot-reload backends. " +
    "If **every** `/api/powervibe/*` request 404s in dev, confirm `app/vite.config.ts` proxies `/api` to `FLIGHT_PORT` and forwards the full `/api/...` path (see README)."
  );
}

/** Prefer actionable copy: HTML body ⇒ proxy/UI origin issue; plain Not Found ⇒ stale Flight / missing `/api/powervibe/*` routes. */
function refinePowervibe404Message(status: number, body: unknown, message: string): string {
  if (status !== 404) return message;
  if (isJsonParseFailedWrapper(body)) {
    const raw = body.raw.trim();
    if (raw.startsWith("<!DOCTYPE") || raw.startsWith("<!doctype")) {
      return misconfiguredVite404Message();
    }
    if (raw === "Not Found" || raw === "") {
      return powervibeBackendNotReloadedMessage();
    }
    if (!raw.startsWith("{")) {
      return powervibeBackendNotReloadedMessage();
    }
  }
  if (message === "Not Found") {
    return powervibeBackendNotReloadedMessage();
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
    return `Empty response from PowerVibe API on ${what}. Confirm Flight is running and the dev server proxies /api to Koa (see README, GET /api/powervibe/diagnostics).`;
  }
  const s = t.trim();
  if (s.startsWith("<!DOCTYPE") || s.startsWith("<!doctype")) {
    return misconfiguredVite404Message();
  }
  return `Non-JSON response from PowerVibe API on ${what} (status ${r.status}). Check that requests hit Koa, not a static file. First bytes: ${s.slice(0, 120).replace(/\s+/g, " ")}${s.length > 120 ? "…" : ""}`;
}

function toFiniteNumberOrNaN(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

const DEFAULT_MATERIALIZED_VUE_PATH = "app/src/components/powervibe/viewer/generated/App.vue";
const DEFAULT_MATERIALIZED_BACKEND_PATH = "app/src/components/powervibe/viewer/generated/App.backend.ts";

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export type FetchPowervibeAppsResult =
  | { ok: true; apps: PowervibeAppSummary[] }
  | { ok: false; status: number; message: string };

/** Coalesce overlapping list fetches (e.g. double mount / parallel callers). */
let fetchPowervibeAppsInFlight: Promise<FetchPowervibeAppsResult> | null = null;

export async function fetchPowervibeApps(): Promise<FetchPowervibeAppsResult> {
  if (fetchPowervibeAppsInFlight) return fetchPowervibeAppsInFlight;
  fetchPowervibeAppsInFlight = doFetchPowervibeApps();
  try {
    return await fetchPowervibeAppsInFlight;
  } finally {
    fetchPowervibeAppsInFlight = null;
  }
}

async function doFetchPowervibeApps(): Promise<FetchPowervibeAppsResult> {
  const r = await fetch(koaApiPath("/api/powervibe/apps"), { cache: "no-store" });
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
      message = refinePowervibe404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { apps?: unknown };
  if (!Array.isArray(o.apps)) {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  const apps = o.apps as PowervibeAppSummary[];
  sortPowervibeAppsByUpdatedAtDesc(apps);
  return { ok: true, apps };
}

export async function createPowervibeApp(
  name?: string,
): Promise<{ ok: true; app: PowervibeAppFull } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath("/api/powervibe/apps"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(name ? { name } : {}),
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
      message = refinePowervibe404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { app?: unknown };
  const notJson = errorIfStatusOkButBodyNotJson(r, body, "POST /api/powervibe/apps");
  if (notJson) {
    return { ok: false, status: r.status, message: notJson };
  }
  if (!o.app || typeof o.app !== "object") {
    return { ok: false, status: r.status, message: "invalid_api_response: missing `app` in create response" };
  }
  return { ok: true, app: o.app as PowervibeAppFull };
}

export type FetchPowervibeAppResult =
  | { ok: true; app: PowervibeAppFull }
  | { ok: false; status: number; message: string };

/** One in-flight GET per app — avoids duplicate materialize + bundle restart when callers overlap. */
const fetchPowervibeAppInFlight = new Map<string, Promise<FetchPowervibeAppResult>>();

/** Drop coalescing so the next `fetchPowervibeApp` is a fresh request (e.g. after Apply — avoids re-awaiting a GET that started before PUT). */
export function invalidatePowervibeAppGetDedupe(appId: string): void {
  fetchPowervibeAppInFlight.delete(appId);
}

export async function fetchPowervibeApp(appId: string): Promise<FetchPowervibeAppResult> {
  const existing = fetchPowervibeAppInFlight.get(appId);
  if (existing) return existing;
  const p = doFetchPowervibeApp(appId);
  fetchPowervibeAppInFlight.set(appId, p);
  void p.finally(() => {
    if (fetchPowervibeAppInFlight.get(appId) === p) {
      fetchPowervibeAppInFlight.delete(appId);
    }
  });
  return p;
}

async function doFetchPowervibeApp(appId: string): Promise<FetchPowervibeAppResult> {
  const r = await fetch(koaApiPath(`/api/powervibe/apps/${encodeURIComponent(appId)}`), {
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
      message = refinePowervibe404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { app?: unknown };
  const notJson = errorIfStatusOkButBodyNotJson(r, body, "GET /api/powervibe/apps/:id");
  if (notJson) {
    return { ok: false, status: r.status, message: notJson };
  }
  if (!o.app || typeof o.app !== "object") {
    return { ok: false, status: r.status, message: "invalid_api_response: missing `app` in get-app response" };
  }
  return { ok: true, app: o.app as PowervibeAppFull };
}

export async function putPowervibeApp(
  appId: string,
  payload: { source: string; backendSource: string; bundleEnv?: string },
  options?: { sourceOrigin?: "manual_code_editor" | "ai_apply" },
): Promise<
  | { ok: true; data: { ok: true; path: string; backendPath: string; bytes: number; backendBytes: number; app: PowervibeAppFull } }
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
  const r = await fetch(koaApiPath(`/api/powervibe/apps/${encodeURIComponent(appId)}`), {
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
      message = refinePowervibe404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const notJson = errorIfStatusOkButBodyNotJson(r, body, "PUT /api/powervibe/apps/:id");
  if (notJson) {
    return { ok: false, status: r.status, message: notJson };
  }
  const o = body as Partial<{
    ok: boolean;
    path: string;
    backendPath: string;
    bytes: number;
    backendBytes: number;
    app: PowervibeAppFull;
  }>;
  if (o.ok !== true || !o.app || typeof o.app !== "object") {
    const miss: string[] = [];
    if (o.ok !== true) miss.push("ok");
    if (!o.app || typeof o.app !== "object") miss.push("app");
    return {
      ok: false,
      status: r.status,
      message: `invalid_api_response: PUT body missing: ${miss.join(", ")}. Restart \`npm run start:app\` if the API is stale; open GET /api/powervibe/diagnostics.`,
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
  return {
    ok: true,
    data: {
      ok: true,
      path,
      backendPath,
      bytes,
      backendBytes,
      app: restApp,
    },
  };
}

export async function patchPowervibeApp(
  appId: string,
  patch: { name?: string; status?: PowervibeAppStatus; app_icon?: string },
): Promise<{ ok: true; app: PowervibeAppFull } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/powervibe/apps/${encodeURIComponent(appId)}`), {
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
      message = refinePowervibe404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { app?: unknown };
  const notJsonPatch = errorIfStatusOkButBodyNotJson(r, body, "PATCH /api/powervibe/apps/:id");
  if (notJsonPatch) {
    return { ok: false, status: r.status, message: notJsonPatch };
  }
  if (!o.app || typeof o.app !== "object") {
    return { ok: false, status: r.status, message: "invalid_api_response: missing `app` in patch response" };
  }
  return { ok: true, app: o.app as PowervibeAppFull };
}

export async function fetchPowervibeMessages(
  appId: string,
): Promise<{ ok: true; messages: ChatMessage[] } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/powervibe/apps/${encodeURIComponent(appId)}/messages`), {
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
      message = refinePowervibe404Message(r.status, body, message);
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

export type PowervibeLastTurnPayload = {
  proposedAppVue: string | null;
  proposedAppBackend: string | null;
  proposedBundleEnv: string | null;
};

function parsePowervibePostSuccessBody(o: {
  messages?: unknown;
  usedStub?: unknown;
  lastPowervibeTurn?: unknown;
}):
  | { ok: true; messages: ChatMessage[]; usedStub: boolean; lastPowervibeTurn: PowervibeLastTurnPayload }
  | { ok: false; message: string } {
  if (!Array.isArray(o.messages) || typeof o.usedStub !== "boolean") {
    return { ok: false, message: "invalid_response" };
  }
  const lt = o.lastPowervibeTurn;
  const lastPowervibeTurn: PowervibeLastTurnPayload = {
    proposedAppVue: null,
    proposedAppBackend: null,
    proposedBundleEnv: null,
  };
  if (lt && typeof lt === "object" && lt !== null) {
    const p = (lt as { proposedAppVue?: unknown }).proposedAppVue;
    if (typeof p === "string") lastPowervibeTurn.proposedAppVue = p;
    else if (p === null) lastPowervibeTurn.proposedAppVue = null;
    const b = (lt as { proposedAppBackend?: unknown }).proposedAppBackend;
    if (typeof b === "string") lastPowervibeTurn.proposedAppBackend = b;
    else if (b === null) lastPowervibeTurn.proposedAppBackend = null;
    const e = (lt as { proposedBundleEnv?: unknown }).proposedBundleEnv;
    if (typeof e === "string") lastPowervibeTurn.proposedBundleEnv = e;
    else if (e === null) lastPowervibeTurn.proposedBundleEnv = null;
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
    lastPowervibeTurn,
  };
}

export async function postPowervibeMessage(
  appId: string,
  text: string,
): Promise<
  | { ok: true; messages: ChatMessage[]; usedStub: boolean; lastPowervibeTurn: PowervibeLastTurnPayload }
  | { ok: false; status: number; message: string }
> {
  const r = await fetch(koaApiPath(`/api/powervibe/apps/${encodeURIComponent(appId)}/messages`), {
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
      message = refinePowervibe404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { messages?: unknown; usedStub?: unknown; lastPowervibeTurn?: unknown };
  const parsed = parsePowervibePostSuccessBody(o);
  if (!parsed.ok) {
    return { ok: false, status: r.status, message: parsed.message };
  }
  return { ok: true, messages: parsed.messages, usedStub: parsed.usedStub, lastPowervibeTurn: parsed.lastPowervibeTurn };
}

export type PowervibeMessageStreamHandlers = {
  onDelta: (receivedChars: number) => void;
  onDone: (payload: {
    messages: ChatMessage[];
    usedStub: boolean;
    lastPowervibeTurn: PowervibeLastTurnPayload;
  }) => void;
  onHttpError: (status: number, message: string) => void;
  onStreamError: (message: string) => void;
};

/** SSE (`text/event-stream`) from `POST …/messages/stream` — same final payload shape as {@link postPowervibeMessage}. */
export async function postPowervibeMessageStream(
  appId: string,
  text: string,
  handlers: PowervibeMessageStreamHandlers,
): Promise<void> {
  const r = await fetch(
    koaApiPath(`/api/powervibe/apps/${encodeURIComponent(appId)}/messages/stream`),
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
      message = refinePowervibe404Message(r.status, body, message);
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
        if (t === "delta" && typeof o.receivedChars === "number") {
          handlers.onDelta(o.receivedChars);
        } else if (t === "error" && typeof o.message === "string") {
          handlers.onStreamError(o.message);
          return;
        } else if (t === "done") {
          const parsed = parsePowervibePostSuccessBody(o);
          if (!parsed.ok) {
            handlers.onStreamError(parsed.message);
            return;
          }
          handlers.onDone({
            messages: parsed.messages,
            usedStub: parsed.usedStub,
            lastPowervibeTurn: parsed.lastPowervibeTurn,
          });
          return;
        }
      }
    }
  }
  handlers.onStreamError("Stream ended before a complete reply.");
}

export async function clearPowervibeMessages(
  appId: string,
): Promise<{ ok: true; messages: ChatMessage[] } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/powervibe/apps/${encodeURIComponent(appId)}/messages`), {
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
      message = refinePowervibe404Message(r.status, body, message);
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

/** Matches server `POWERVIBE_TRANSCRIBE_MAX_BYTES` in geminiTranscribeAudio.ts */
const POWERVIBE_TRANSCRIBE_MAX_BYTES = 8 * 1024 * 1024;

async function powervibeBlobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** POST `/api/powervibe/transcribe-audio` — Gemini transcription for prompt-panel mic clips. */
export async function postPowervibeTranscribeAudio(
  blob: Blob,
): Promise<{ ok: true; text: string } | { ok: false; status: number; message: string }> {
  if (blob.size > POWERVIBE_TRANSCRIBE_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      message: `Recording exceeds the maximum size (${Math.round(POWERVIBE_TRANSCRIBE_MAX_BYTES / (1024 * 1024))} MiB). Stop sooner or try a shorter clip.`,
    };
  }
  const mimeType = blob.type?.trim() || "audio/webm";
  let audioBase64: string;
  try {
    audioBase64 = await powervibeBlobToBase64(blob);
  } catch {
    return { ok: false, status: 400, message: "Could not read audio data." };
  }
  const r = await fetch(koaApiPath("/api/powervibe/transcribe-audio"), {
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
      message = refinePowervibe404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { text?: unknown };
  const text = typeof o.text === "string" ? o.text.trim() : "";
  const notJson = errorIfStatusOkButBodyNotJson(r, body, "POST /api/powervibe/transcribe-audio");
  if (notJson) {
    return { ok: false, status: r.status, message: notJson };
  }
  return { ok: true, text };
}

export async function fetchPowervibeSourceRevisions(appId: string): Promise<
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
  const r = await fetch(koaApiPath(`/api/powervibe/apps/${encodeURIComponent(appId)}/source-revisions`));
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
      message = refinePowervibe404Message(r.status, body, message);
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

export type PowervibeRevisionActivityMetrics = {
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
export async function fetchPowervibeRevisionActivity(
  days = 14,
): Promise<
  | { ok: true; metrics: PowervibeRevisionActivityMetrics }
  | { ok: false; status: number; message: string }
> {
  const d = Math.max(1, Math.min(90, days));
  const r = await fetch(
    koaApiPath(`/api/powervibe/metrics/revision-activity?${new URLSearchParams({ days: String(d) })}`),
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
      message = refinePowervibe404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as Partial<PowervibeRevisionActivityMetrics>;
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
  return { ok: true, metrics: o as PowervibeRevisionActivityMetrics };
}

/**
 * Same Scribe time-travel math as the batch `/api/powervibe/metrics/revision-activity` route, but calling
 * existing per-app `GET /api/powervibe/apps/:id/source-revisions` n times. Use when the batch route 404s (Flight
 * does not hot-reload `*.backend.ts` — restart `start:app` to pick up new Koa paths).
 */
export async function buildRevisionActivityFromAppList(
  apps: PowervibeAppSummary[],
  days: number,
): Promise<PowervibeRevisionActivityMetrics> {
  const n = Math.max(1, Math.min(90, days));
  const all: Date[] = [];
  let totalRevisions = 0;
  let appsWithHistory = 0;
  let usedRegistryFallback = false;

  for (const a of apps) {
    const probe = await fetchPowervibeSourceRevisions(a.app_id);
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

export async function deletePowervibeApp(
  appId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/powervibe/apps/${encodeURIComponent(appId)}`), { method: "DELETE" });
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
      message = refinePowervibe404Message(r.status, body, message);
    }
    return { ok: false, status: r.status, message };
  }
  return { ok: true };
}
