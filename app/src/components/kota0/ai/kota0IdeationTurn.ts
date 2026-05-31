import { z } from "zod";

/**
 * After parsing: we prefer **markdown** from Gemini (a ```vue fence for the SFC) so we never rely on
 * string-escaping a full SFC inside JSON. If the model still returns JSON, we map it here.
 * Full `App.vue` is taken from a ```vue fenced block in the assistant text (or legacy JSON `assistantMessage`).
 */
export const Kota0IdeationGeminiSchema = z.object({
  assistantMessage: z.string(),
  /** Parsed for API compatibility; not shown in chat — prefer `[]`. */
  planBullets: z.array(z.string()).default([]),
  /** Parsed for API compatibility; not shown in chat — prefer `[]`. */
  openQuestions: z.array(z.string()).default([]),
});

export type Kota0IdeationGeminiJson = z.infer<typeof Kota0IdeationGeminiSchema>;

/** Full ideation turn after extracting optional SFC / backend / env from `assistantMessage`. */
export type Kota0IdeationTurn = Kota0IdeationGeminiJson & {
  proposedAppVue: string | null;
  proposedAppBackend: string | null;
  /** Dotenv-style patch merged into bundle Secrets on **Apply** (```env fence). */
  proposedBundleEnv: string | null;
};
