/**
 * Server-only: transcribe microphone audio via Gemini (Generative Language API).
 * Uses `fetch` instead of `@google/genai`’s `generateContent` helper so we never hit client-side
 * rejects like “audioTimestamp parameter is not supported” when `config` is normalized elsewhere.
 */
import "@/lib/env";

export const POWERVIBE_TRANSCRIBE_MAX_BYTES = 8 * 1024 * 1024;

/** Ceiling for base64 body size before decoding (~8 MiB binary). */
export const POWERVIBE_TRANSCRIBE_MAX_BASE64_CHARS = Math.ceil((POWERVIBE_TRANSCRIBE_MAX_BYTES * 4) / 3) + 256;

const GEMINI_GENERATE_CONTENT_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const ALLOWED_MIME_ROOT = new Set([
  "audio/webm",
  "video/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
]);

export function resolvePowervibeTranscribeMimeRoot(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const root = t.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_MIME_ROOT.has(root) ? root : null;
}

/** MediaRecorder often uses video/webm for audio-only clips; Gemini expects an audio MIME for speech. */
export function mimeTypeForGeminiInlineAudio(mimeRoot: string): string {
  return mimeRoot === "video/webm" ? "audio/webm" : mimeRoot;
}

/** Steers the model away from “creative” subtitles / movie dialogue when mic audio is noisy or thin. */
const TRANSCRIBE_SYSTEM_INSTRUCTION =
  "You are a speech-to-text transcriber for a developer dictating UI instructions into a microphone. " +
  "Output ONLY words you clearly hear in THIS audio clip — plain text, same language as the speaker. " +
  "Do NOT invent dialogue, movie lines, rumors, characters, or narrative. Do NOT quote TV, film, or books. " +
  "Do NOT add timestamps (no HH:MM:SS, no ranges like 00:00:00 - 00:00:15, no SRT-style cues). " +
  "Do NOT add labels such as Transcription:, Speaker:, or quotes around the whole reply. " +
  "If the clip is silent, mostly noise, music without intelligible speech, or you cannot make out words, output exactly this token on its own line and nothing else: NO_SPEECH_ASR_ONLY (do not use spaces or empty lines instead).";

const TRANSCRIBE_USER_TEXT =
  "Transcribe the recording: verbatim spoken words only, one flowing block of text. If you hear no intelligible speech, output only NO_SPEECH_ASR_ONLY.";

const DEFAULT_GEMINI_TRANSCRIBE_MODEL = "gemini-2.5-flash";

type RestPart = { text?: string };

function partsFromContent(content: unknown): RestPart[] {
  if (!content || typeof content !== "object") return [];
  const parts = (content as { parts?: unknown }).parts;
  return Array.isArray(parts) ? (parts as RestPart[]) : [];
}

function transcriptionFromGeminiRestJson(json: unknown): string {
  const chunks: string[] = [];
  const candidates = (json as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  for (const cand of candidates) {
    if (!cand || typeof cand !== "object") continue;
    const c = cand as Record<string, unknown>;
    const content = c.content ?? c.output;
    for (const part of partsFromContent(content)) {
      if (part.text) chunks.push(part.text);
    }
    /** Some REST payloads nest text only under `parts` on the candidate (defensive). */
    if (!chunks.length && Array.isArray(c.parts)) {
      for (const part of c.parts as RestPart[]) {
        if (part?.text) chunks.push(part.text);
      }
    }
  }
  return chunks.join("").trim();
}

function extractRestErrorMessage(json: unknown, httpStatus: number): string {
  if (json && typeof json === "object" && "error" in json) {
    const e = (json as { error?: { message?: string } }).error;
    if (e && typeof e.message === "string" && e.message.trim()) {
      return `Gemini ${httpStatus}: ${e.message.trim()}`;
    }
  }
  return `Gemini HTTP ${httpStatus}`;
}

/** Models sometimes emit a fake subtitle header even when asked not to; drop one leading timestamp-only line. */
function stripLeadingSubtitleTimestampLine(text: string): string {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return text;
  const first = lines[0]?.trim() ?? "";
  if (
    /^\d{1,2}:\d{2}:\d{2}(?:\.\d{1,3})?\s*-\s*\d{1,2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(first)
  ) {
    return lines.slice(1).join("\n").trim();
  }
  return text;
}

const NO_SPEECH_SENTINEL = /^NO_SPEECH_ASR_ONLY$/i;

/** Models often return whitespace instead of a true empty string; that trims to nothing on the client. */
function normalizeExtractedTranscript(raw: string): string {
  let t = stripLeadingSubtitleTimestampLine(raw);
  t = t.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (!/\S/.test(t)) return "";
  if (NO_SPEECH_SENTINEL.test(t)) return "";
  return t.trim();
}

async function geminiGenerateContentRest(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `${GEMINI_GENERATE_CONTENT_URL}/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  let json: unknown;
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`Gemini returned non-JSON (HTTP ${res.status}): ${rawText.slice(0, 800)}`);
  }
  if (!res.ok) {
    throw new Error(extractRestErrorMessage(json, res.status));
  }
  return json;
}

export async function transcribePowervibeAudioWithGemini(audioBytes: Buffer, mimeRoot: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const model = process.env.GEMINI_TRANSCRIBE_MODEL?.trim() || DEFAULT_GEMINI_TRANSCRIBE_MODEL;
  const geminiMime = mimeTypeForGeminiInlineAudio(mimeRoot);
  const base64 = audioBytes.toString("base64");

  /** Matches the Gemini REST JSON shape (camelCase) used by the official clients. */
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: TRANSCRIBE_SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: "user",
        parts: [
          { text: TRANSCRIBE_USER_TEXT },
          { inlineData: { mimeType: geminiMime, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      topP: 1,
      topK: 1,
      maxOutputTokens: 8192,
    },
  };

  try {
    const json = await geminiGenerateContentRest(apiKey, model, body);
    const rawExtracted = transcriptionFromGeminiRestJson(json);
    return normalizeExtractedTranscript(rawExtracted);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    throw new Error(`${message} | Model: ${model}.`);
  }
}
