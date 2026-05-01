/**
 * Server-only: short Gemini call to transcribe uploaded microphone audio for PowerVibe prompt panel.
 */
import "@/lib/env";

import { ApiError, GoogleGenAI } from "@google/genai";

export const POWERVIBE_TRANSCRIBE_MAX_BYTES = 8 * 1024 * 1024;

/** Ceiling for base64 body size before decoding (~8 MiB binary). */
export const POWERVIBE_TRANSCRIBE_MAX_BASE64_CHARS = Math.ceil((POWERVIBE_TRANSCRIBE_MAX_BYTES * 4) / 3) + 256;

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

function formatGeminiError(e: unknown, model: string): string {
  if (e instanceof ApiError) {
    const extra =
      e.status === 403 || e.status === 400 ?
        ` | Hint: use an API key from https://aistudio.google.com/apikey , enable "Generative Language API" on the GCP project. Current model: ${model}.`
      : "";
    return `${e.message}${extra}`;
  }
  return e instanceof Error ? e.message : "unknown_error";
}

const TRANSCRIBE_PROMPT =
  "Transcribe the attached audio to plain text only. Output the spoken words verbatim in the user's language. " +
  "Do not add labels like 'Transcription:' or quotation marks around the whole text. If there is no speech, reply with an empty string.";

/** Text-first preview models used for chat do not always honor short mic clips; keep transcription on a stable multimodal flash model unless overridden. */
const DEFAULT_GEMINI_TRANSCRIBE_MODEL = "gemini-2.0-flash";

export async function transcribePowervibeAudioWithGemini(audioBytes: Buffer, mimeRoot: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const model = process.env.GEMINI_TRANSCRIBE_MODEL?.trim() || DEFAULT_GEMINI_TRANSCRIBE_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const geminiMime = mimeTypeForGeminiInlineAudio(mimeRoot);
  const base64 = audioBytes.toString("base64");

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: TRANSCRIBE_PROMPT },
            { inlineData: { mimeType: geminiMime, data: base64 } },
          ],
        },
      ],
      config: {
        maxOutputTokens: 8192,
        temperature: 0,
        topP: 1,
      },
    });
    const text = typeof response.text === "string" ? response.text : "";
    return text.trim();
  } catch (e) {
    throw new Error(formatGeminiError(e, model));
  }
}
