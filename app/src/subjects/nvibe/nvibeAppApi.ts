/** nVibe apps API — in dev, use same-origin `/api/*` so Vite proxies to Koa (see `app/vite.config.ts`). */

import type { ChatMessage } from "@/types/chat";
import type { NvibeAppFull, NvibeAppStatus, NvibeAppSummary } from "./nvibeAppTypes";

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
    "Not Found (likely Vite returned HTML: /api proxy must target Koa on FLIGHT_PORT, not port 3001; restart `npm run start:app` after adding backends)."
  );
}

/** Plain-text or HTML 404 from Koa/Vite — often a Flight worker that never reloaded `*.backend.ts`. */
function nvibeBackendNotReloadedMessage(): string {
  return (
    "nVibe route not found (HTTP 404). Restart `npm run start:app` so Koa reloads `*.backend.ts` — Flight does not hot-reload backends. " +
    "Also confirm `app/vite.config.ts` proxies `/api` to `FLIGHT_PORT` (see README)."
  );
}

/** True when 404 looks like a missing route, not a JSON `{ error: \"app_not_found\" }` from our handlers. */
function isLikelyMissingNvibeRoute(status: number, body: unknown): boolean {
  if (status !== 404 || typeof body !== "object" || body === null) return false;
  const o = body as Record<string, unknown>;
  if (typeof o.error === "string") return false;
  if ("raw" in o && typeof o.raw === "string") {
    const raw = o.raw.trim();
    if (raw === "Not Found" || raw.startsWith("<!DOCTYPE") || raw.startsWith("<!doctype")) return true;
  }
  return false;
}

async function parseJsonResponse(text: string): Promise<unknown> {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export async function fetchNvibeApps(): Promise<
  { ok: true; apps: NvibeAppSummary[] } | { ok: false; status: number; message: string }
> {
  const r = await fetch(koaApiPath("/api/nvibe/apps"));
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
    if (r.status === 404 && message === "Not Found") {
      message = misconfiguredVite404Message();
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { apps?: unknown };
  if (!Array.isArray(o.apps)) {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  return { ok: true, apps: o.apps as NvibeAppSummary[] };
}

export async function createNvibeApp(
  name?: string,
): Promise<{ ok: true; app: NvibeAppFull } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath("/api/nvibe/apps"), {
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
    if (r.status === 404 && message === "Not Found") {
      message = misconfiguredVite404Message();
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { app?: unknown };
  if (!o.app || typeof o.app !== "object") {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  return { ok: true, app: o.app as NvibeAppFull };
}

export async function fetchNvibeApp(
  appId: string,
): Promise<{ ok: true; app: NvibeAppFull } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/nvibe/apps/${encodeURIComponent(appId)}`));
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
    if (r.status === 404 && message === "Not Found") {
      message = misconfiguredVite404Message();
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { app?: unknown };
  if (!o.app || typeof o.app !== "object") {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  return { ok: true, app: o.app as NvibeAppFull };
}

export async function putNvibeAppSource(
  appId: string,
  source: string,
  options?: { sourceOrigin?: "manual_code_editor" | "ai_apply" },
): Promise<
  { ok: true; data: { ok: true; path: string; bytes: number; app: NvibeAppFull } } | { ok: false; status: number; message: string }
> {
  const requestBody: { source: string; sourceOrigin?: string } = { source };
  if (options?.sourceOrigin === "manual_code_editor") {
    requestBody.sourceOrigin = "manual_code_editor";
  } else if (options?.sourceOrigin === "ai_apply") {
    requestBody.sourceOrigin = "ai_apply";
  }
  const r = await fetch(koaApiPath(`/api/nvibe/apps/${encodeURIComponent(appId)}`), {
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
    if (r.status === 404 && message === "Not Found") {
      message = misconfiguredVite404Message();
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as Partial<{ ok: boolean; path: string; bytes: number; app: NvibeAppFull }>;
  if (!o.ok || typeof o.path !== "string" || typeof o.bytes !== "number" || !o.app) {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  return {
    ok: true,
    data: { ok: true, path: o.path, bytes: o.bytes, app: o.app },
  };
}

export async function patchNvibeApp(
  appId: string,
  patch: { name?: string; status?: NvibeAppStatus },
): Promise<{ ok: true; app: NvibeAppFull } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/nvibe/apps/${encodeURIComponent(appId)}`), {
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
    if (r.status === 404 && message === "Not Found") {
      message = misconfiguredVite404Message();
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { app?: unknown };
  if (!o.app || typeof o.app !== "object") {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  return { ok: true, app: o.app as NvibeAppFull };
}

export async function fetchNvibeMessages(
  appId: string,
): Promise<{ ok: true; messages: ChatMessage[] } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/nvibe/apps/${encodeURIComponent(appId)}/messages`));
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
      if (isLikelyMissingNvibeRoute(r.status, body)) {
        message = nvibeBackendNotReloadedMessage();
      } else if (message === "Not Found") {
        message = misconfiguredVite404Message();
      }
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
  return { ok: true, messages };
}

export type NvibeLastTurnPayload = { proposedAppVue: string | null };

function parseNvibePostSuccessBody(o: {
  messages?: unknown;
  usedStub?: unknown;
  lastNvibeTurn?: unknown;
}):
  | { ok: true; messages: ChatMessage[]; usedStub: boolean; lastNvibeTurn: NvibeLastTurnPayload }
  | { ok: false; message: string } {
  if (!Array.isArray(o.messages) || typeof o.usedStub !== "boolean") {
    return { ok: false, message: "invalid_response" };
  }
  const lt = o.lastNvibeTurn;
  let lastNvibeTurn: NvibeLastTurnPayload = { proposedAppVue: null };
  if (lt && typeof lt === "object" && lt !== null && "proposedAppVue" in lt) {
    const p = (lt as { proposedAppVue: unknown }).proposedAppVue;
    if (typeof p === "string") lastNvibeTurn = { proposedAppVue: p };
    else if (p === null) lastNvibeTurn = { proposedAppVue: null };
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
  return { ok: true, messages, usedStub: o.usedStub, lastNvibeTurn };
}

export async function postNvibeMessage(
  appId: string,
  text: string,
): Promise<
  | { ok: true; messages: ChatMessage[]; usedStub: boolean; lastNvibeTurn: NvibeLastTurnPayload }
  | { ok: false; status: number; message: string }
> {
  const r = await fetch(koaApiPath(`/api/nvibe/apps/${encodeURIComponent(appId)}/messages`), {
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
      if (isLikelyMissingNvibeRoute(r.status, body)) {
        message = nvibeBackendNotReloadedMessage();
      } else if (message === "Not Found") {
        message = misconfiguredVite404Message();
      }
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { messages?: unknown; usedStub?: unknown; lastNvibeTurn?: unknown };
  const parsed = parseNvibePostSuccessBody(o);
  if (!parsed.ok) {
    return { ok: false, status: r.status, message: parsed.message };
  }
  return { ok: true, messages: parsed.messages, usedStub: parsed.usedStub, lastNvibeTurn: parsed.lastNvibeTurn };
}

export type NvibeMessageStreamHandlers = {
  onDelta: (receivedChars: number) => void;
  onDone: (payload: {
    messages: ChatMessage[];
    usedStub: boolean;
    lastNvibeTurn: NvibeLastTurnPayload;
  }) => void;
  onHttpError: (status: number, message: string) => void;
  onStreamError: (message: string) => void;
};

/** SSE (`text/event-stream`) from `POST …/messages/stream` — same final payload shape as {@link postNvibeMessage}. */
export async function postNvibeMessageStream(
  appId: string,
  text: string,
  handlers: NvibeMessageStreamHandlers,
): Promise<void> {
  const r = await fetch(
    koaApiPath(`/api/nvibe/apps/${encodeURIComponent(appId)}/messages/stream`),
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
      if (isLikelyMissingNvibeRoute(r.status, body)) {
        message = nvibeBackendNotReloadedMessage();
      } else if (message === "Not Found") {
        message = misconfiguredVite404Message();
      }
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
          const parsed = parseNvibePostSuccessBody(o);
          if (!parsed.ok) {
            handlers.onStreamError(parsed.message);
            return;
          }
          handlers.onDone({
            messages: parsed.messages,
            usedStub: parsed.usedStub,
            lastNvibeTurn: parsed.lastNvibeTurn,
          });
          return;
        }
      }
    }
  }
  handlers.onStreamError("Stream ended before a complete reply.");
}

export async function clearNvibeMessages(
  appId: string,
): Promise<{ ok: true; messages: ChatMessage[] } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/nvibe/apps/${encodeURIComponent(appId)}/messages`), {
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
      if (isLikelyMissingNvibeRoute(r.status, body)) {
        message = nvibeBackendNotReloadedMessage();
      } else if (message === "Not Found") {
        message = misconfiguredVite404Message();
      }
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
  return { ok: true, messages };
}

export async function fetchNvibeSourceRevisions(appId: string): Promise<
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
  const r = await fetch(koaApiPath(`/api/nvibe/apps/${encodeURIComponent(appId)}/source-revisions`));
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
    if (r.status === 404 && message === "Not Found") {
      message = misconfiguredVite404Message();
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

export async function deleteNvibeApp(
  appId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/nvibe/apps/${encodeURIComponent(appId)}`), { method: "DELETE" });
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
    if (r.status === 404 && message === "Not Found") {
      message = misconfiguredVite404Message();
    }
    return { ok: false, status: r.status, message };
  }
  return { ok: true };
}
