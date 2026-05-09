/**
 * Call workspace Kota0 AI from bundle `App.backend.ts` — uses `K0_PLATFORM_API_ORIGIN` +
 * `K0_APP_ID` from bundle `.env` (no Gemini secrets in the bundle for this path).
 *
 * Request bodies must serialize as a JSON **object** `{ ... }`: workspace Flight uses `koa-bodyparser`
 * / co-body **strict** JSON mode, which rejects bodies that start with a JSON string (`"…"`).
 */

export type Kota0PlatformAiCompleteBody = {
  prompt: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
};

/** Plain object sent as `POST` JSON — safe for strict parsers (always `{`). */
export type Kota0PlatformAiRequestPayload = {
  prompt: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
};

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/**
 * Normalize and validate the client payload before `fetch`. Throws with actionable messages when
 * callers pass a raw prompt string or wrong shapes (common mistake → HTTP 400 from strict JSON).
 */
export function buildKota0PlatformAiRequestPayload(input: unknown): Kota0PlatformAiRequestPayload {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(
      "k0_platform_ai_invalid_body: pass an object with { prompt: string }; do not pass the prompt string alone — workspace Flight parses JSON in strict mode (object/array only).",
    );
  }
  const o = input as Record<string, unknown>;
  if (typeof o.prompt !== "string") {
    throw new Error(
      'k0_platform_ai_invalid_body: prompt must be a string — call kota0PlatformAiCompleteText({ prompt: "…" }), not kota0PlatformAiCompleteText("…").',
    );
  }
  const prompt = o.prompt.trim();
  if (!prompt) {
    throw new Error("k0_platform_ai_invalid_body: prompt must be non-empty after trim.");
  }
  const payload: Kota0PlatformAiRequestPayload = { prompt };
  if (o.systemInstruction !== undefined) {
    if (typeof o.systemInstruction !== "string") {
      throw new Error("k0_platform_ai_invalid_body: systemInstruction must be a string when set.");
    }
    payload.systemInstruction = o.systemInstruction;
  }
  if (o.maxOutputTokens !== undefined) {
    if (typeof o.maxOutputTokens !== "number" || !Number.isFinite(o.maxOutputTokens)) {
      throw new Error("k0_platform_ai_invalid_body: maxOutputTokens must be a finite number when set.");
    }
    payload.maxOutputTokens = o.maxOutputTokens;
  }
  return payload;
}

/**
 * POST `/api/kota0/apps/:appId/ai/complete` on the workspace host; returns model text or throws with server detail when possible.
 */
export async function kota0PlatformAiCompleteText(body: Kota0PlatformAiCompleteBody): Promise<string> {
  const payload = buildKota0PlatformAiRequestPayload(body);
  const origin = trimTrailingSlash(process.env.K0_PLATFORM_API_ORIGIN?.trim() ?? "");
  const appId = process.env.K0_APP_ID?.trim() ?? "";
  if (!origin || !appId) {
    throw new Error(
      "k0_platform_ai_missing_env: set K0_PLATFORM_API_ORIGIN and K0_APP_ID in bundle .env",
    );
  }
  const url = `${origin}/api/kota0/apps/${encodeURIComponent(appId)}/ai/complete`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  let data: { text?: unknown; error?: unknown; message?: unknown };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new Error(`k0_platform_ai_bad_json: HTTP ${res.status}`);
  }
  if (!res.ok) {
    const msg = typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : "";
    throw new Error(msg || `k0_platform_ai_http_${res.status}`);
  }
  if (typeof data.text !== "string" || data.text.length === 0) {
    throw new Error("k0_platform_ai_empty_response");
  }
  return data.text;
}
