/** Kota0 apps API — in dev, use same-origin `/api/*` so Vite proxies to Koa (see `app/vite.config.ts`). */

import type { ChatMessage } from "@/types/chat";
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
    "Not Found (likely Vite returned HTML: /api proxy must target Koa on FLIGHT_PORT, not port 3001; restart `npm run start:app` after adding backends)."
  );
}

/** Plain-text or HTML 404 from Koa/Vite — often a Flight worker that never reloaded `*.backend.ts`. */
function kota0BackendNotReloadedMessage(): string {
  return (
    "Kota0 route not found (HTTP 404). Restart `npm run start:app` so Koa reloads `*.backend.ts` — Flight does not hot-reload backends. " +
    "Also confirm `app/vite.config.ts` proxies `/api` to `FLIGHT_PORT` (see README)."
  );
}

/** True when 404 looks like a missing route, not a JSON `{ error: \"app_not_found\" }` from our handlers. */
function isLikelyMissingKota0Route(status: number, body: unknown): boolean {
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

export async function fetchKota0Apps(): Promise<
  { ok: true; apps: Kota0AppSummary[] } | { ok: false; status: number; message: string }
> {
  const r = await fetch(koaApiPath("/api/kota0/apps"));
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
  return { ok: true, apps: o.apps as Kota0AppSummary[] };
}

export async function createKota0App(
  name?: string,
): Promise<{ ok: true; app: Kota0AppFull } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath("/api/kota0/apps"), {
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
  return { ok: true, app: o.app as Kota0AppFull };
}

export async function fetchKota0App(
  appId: string,
): Promise<{ ok: true; app: Kota0AppFull } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}`));
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
  return { ok: true, app: o.app as Kota0AppFull };
}

export async function putKota0AppSource(
  appId: string,
  source: string,
  options?: { sourceOrigin?: "manual_code_editor" | "ai_apply" },
): Promise<
  { ok: true; data: { ok: true; path: string; bytes: number; app: Kota0AppFull } } | { ok: false; status: number; message: string }
> {
  const requestBody: { source: string; sourceOrigin?: string } = { source };
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
    if (r.status === 404 && message === "Not Found") {
      message = misconfiguredVite404Message();
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as Partial<{ ok: boolean; path: string; bytes: number; app: Kota0AppFull }>;
  if (!o.ok || typeof o.path !== "string" || typeof o.bytes !== "number" || !o.app) {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  return {
    ok: true,
    data: { ok: true, path: o.path, bytes: o.bytes, app: o.app },
  };
}

export async function patchKota0App(
  appId: string,
  patch: { name?: string; status?: Kota0AppStatus },
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
    if (r.status === 404 && message === "Not Found") {
      message = misconfiguredVite404Message();
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { app?: unknown };
  if (!o.app || typeof o.app !== "object") {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  return { ok: true, app: o.app as Kota0AppFull };
}

export async function fetchKota0Messages(
  appId: string,
): Promise<{ ok: true; messages: ChatMessage[] } | { ok: false; status: number; message: string }> {
  const r = await fetch(koaApiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/messages`));
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
      if (isLikelyMissingKota0Route(r.status, body)) {
        message = kota0BackendNotReloadedMessage();
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

export type Kota0LastTurnPayload = { proposedAppVue: string | null };

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
      if (isLikelyMissingKota0Route(r.status, body)) {
        message = kota0BackendNotReloadedMessage();
      } else if (message === "Not Found") {
        message = misconfiguredVite404Message();
      }
    }
    return { ok: false, status: r.status, message };
  }
  const o = body as { messages?: unknown; usedStub?: unknown; lastKota0Turn?: unknown };
  if (!Array.isArray(o.messages) || typeof o.usedStub !== "boolean") {
    return { ok: false, status: r.status, message: "invalid_response" };
  }
  const lt = o.lastKota0Turn;
  let lastKota0Turn: Kota0LastTurnPayload = { proposedAppVue: null };
  if (lt && typeof lt === "object" && lt !== null && "proposedAppVue" in lt) {
    const p = (lt as { proposedAppVue: unknown }).proposedAppVue;
    if (typeof p === "string") lastKota0Turn = { proposedAppVue: p };
    else if (p === null) lastKota0Turn = { proposedAppVue: null };
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
  return { ok: true, messages, usedStub: o.usedStub, lastKota0Turn };
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
      if (isLikelyMissingKota0Route(r.status, body)) {
        message = kota0BackendNotReloadedMessage();
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
    if (r.status === 404 && message === "Not Found") {
      message = misconfiguredVite404Message();
    }
    return { ok: false, status: r.status, message };
  }
  return { ok: true };
}
