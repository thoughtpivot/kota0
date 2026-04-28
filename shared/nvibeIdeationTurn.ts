import { z } from "zod";

/**
 * After parsing: we prefer **markdown** from Gemini (a ```vue fence for the SFC) so we never rely on
 * string-escaping a full SFC inside JSON. If the model still returns JSON, we map it here.
 * Full `App.vue` is taken from a ```vue fenced block in the assistant text (or legacy JSON `assistantMessage`).
 */
export const NvibeIdeationGeminiSchema = z.object({
  assistantMessage: z.string(),
  /** Parsed for API compatibility; not shown in chat — prefer `[]`. */
  planBullets: z.array(z.string()).default([]),
  /** Parsed for API compatibility; not shown in chat — prefer `[]`. */
  openQuestions: z.array(z.string()).default([]),
});

export type NvibeIdeationGeminiJson = z.infer<typeof NvibeIdeationGeminiSchema>;

/** Full ideation turn after extracting optional SFC / backend from `assistantMessage`. */
export type NvibeIdeationTurn = NvibeIdeationGeminiJson & {
  proposedAppVue: string | null;
  proposedAppBackend: string | null;
};
