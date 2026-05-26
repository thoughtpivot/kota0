/**
 * Workspace Kota0 AI completion — uses repo-root `GEMINI_API_KEY` / `GEMINI_MODEL` (not bundle secrets).
 * Called from `POST /api/kota0/apps/:appId/ai/complete`.
 */
import { kota0AiGenerate } from "@/components/kota0/ai/kota0AiProvider";

/** Total UTF-8 byte budget for `prompt` + optional `systemInstruction`. */
export const K0_PLATFORM_AI_MAX_INPUT_BYTES = 256 * 1024;

export type Kota0PlatformAiCompleteInput = {
  prompt: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
};

export type Kota0PlatformAiCompleteResult =
  | { ok: true; text: string }
  | { ok: false; status: 503 | 502; error: string; message: string };

export function validateKota0PlatformAiPayload(
  body: unknown,
): { ok: true; value: Kota0PlatformAiCompleteInput } | { ok: false; message: string; code: "bad_body" | "payload_too_large" } {
  if (body === null || typeof body !== "object") {
    return { ok: false, code: "bad_body", message: "Body must be a JSON object." };
  }
  const o = body as Record<string, unknown>;
  const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
  if (!prompt) {
    return { ok: false, code: "bad_body", message: "Field `prompt` is required (non-empty string)." };
  }
  let systemInstruction: string | undefined;
  if (o.systemInstruction !== undefined) {
    if (typeof o.systemInstruction !== "string") {
      return { ok: false, code: "bad_body", message: "Field `systemInstruction` must be a string when set." };
    }
    systemInstruction = o.systemInstruction.trim();
    if (systemInstruction === "") systemInstruction = undefined;
  }
  let maxOutputTokens: number | undefined;
  if (o.maxOutputTokens !== undefined) {
    const n = Number(o.maxOutputTokens);
    if (!Number.isFinite(n) || n < 1 || n > 8192) {
      return { ok: false, code: "bad_body", message: "Field `maxOutputTokens` must be between 1 and 8192 when set." };
    }
    maxOutputTokens = Math.floor(n);
  }
  const inputBytes = Buffer.byteLength(prompt, "utf8") + Buffer.byteLength(systemInstruction ?? "", "utf8");
  if (inputBytes > K0_PLATFORM_AI_MAX_INPUT_BYTES) {
    return {
      ok: false,
      code: "payload_too_large",
      message: `prompt + systemInstruction exceed ${K0_PLATFORM_AI_MAX_INPUT_BYTES} UTF-8 bytes.`,
    };
  }
  return { ok: true, value: { prompt, ...(systemInstruction !== undefined ? { systemInstruction } : {}), ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}) } };
}

export async function runWorkspaceGeminiTextCompletion(input: Kota0PlatformAiCompleteInput): Promise<Kota0PlatformAiCompleteResult> {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return {
      ok: false,
      status: 503,
      error: "gemini_not_configured",
      message: "Workspace GEMINI_API_KEY is not set — configure repo-root .env for Kota0 AI.",
    };
  }
  try {
    const result = await kota0AiGenerate({
      prompt: input.prompt,
      ...(input.systemInstruction !== undefined ? { system: input.systemInstruction } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
    });
    const text = result.text?.trim();
    if (!text) {
      return {
        ok: false,
        status: 502,
        error: "empty_model_output",
        message: "Gemini returned no text.",
      };
    }
    return { ok: true, text };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return {
      ok: false,
      status: 502,
      error: "gemini_request_failed",
      message,
    };
  }
}
