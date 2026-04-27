import { z } from "zod";

/**
 * JSON the model returns (small, single-line-friendly fields only).
 * Full `App.vue` must live in a ```vue fenced block inside `assistantMessage` — not as a JSON string,
 * so Gemini JSON mode and `JSON.parse` stay reliable.
 */
export const Kota0IdeationGeminiSchema = z.object({
  assistantMessage: z.string(),
  /** Parsed for API compatibility; not shown in chat — prefer `[]`. */
  planBullets: z.array(z.string()).default([]),
  /** Parsed for API compatibility; not shown in chat — prefer `[]`. */
  openQuestions: z.array(z.string()).default([]),
});

export type Kota0IdeationGeminiJson = z.infer<typeof Kota0IdeationGeminiSchema>;

/** Full ideation turn after extracting optional SFC from `assistantMessage`. */
export type Kota0IdeationTurn = Kota0IdeationGeminiJson & {
  proposedAppVue: string | null;
};
