import { z } from "zod";

/** One structured reply from the plan assistant (Gemini JSON + client validation). */
export const PlanTurnSchema = z.object({
  assistantMessage: z.string(),
  planBullets: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type PlanTurn = z.infer<typeof PlanTurnSchema>;
