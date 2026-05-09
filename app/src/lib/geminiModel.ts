/**
 * Single default for `GEMINI_MODEL` when unset (Plan + Kota0 ideation).
 * See https://ai.google.dev/gemini-api/docs/models — override in `.env` (e.g. `gemini-3.1-pro-preview` for stronger / costlier turns).
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

/**
 * Mic transcription default when `GEMINI_TRANSCRIBE_MODEL` is unset.
 * Do not use `GEMINI_MODEL` (often a Gemini 3 preview) for STT—those models tend to narrate or hallucinate
 * instead of transcribing raw speech.
 */
export const K0_TRANSCRIBE_DEFAULT_MODEL = "gemini-2.5-flash";
