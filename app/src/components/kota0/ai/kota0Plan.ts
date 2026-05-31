import { z } from "zod";

/**
 * "Plan" envelope produced by the plan turn of the two-turn ideation flow. It is
 * persisted in `k0_chat_message` with `kind: "plan"`; the chat UI renders it as a
 * card with Accept / Edit / Reject controls. On Accept, the apply turn consumes
 * this envelope as its primary instruction and emits patches or, when the plan
 * has `kind: "rewrite"`, a full-file rewrite.
 *
 * Stored as a JSON string inside the `content` column so existing chat-row
 * machinery (filtering, pagination) keeps working unchanged.
 */
export const Kota0PlanChangeKindSchema = z.enum(["add", "modify", "remove", "rewrite"]);
export type Kota0PlanChangeKind = z.infer<typeof Kota0PlanChangeKindSchema>;

export const Kota0PlanFileSchema = z.enum(["App.vue", "App.backend.ts", ".env"]);
export type Kota0PlanFile = z.infer<typeof Kota0PlanFileSchema>;

export const Kota0PlanChangeSchema = z.object({
  file: Kota0PlanFileSchema,
  /** One-line summary the user sees in the plan card. */
  summary: z.string(),
  kind: Kota0PlanChangeKindSchema,
});

export const Kota0PlanSchema = z.object({
  /** One-line restatement of the user's ask, in the model's own words. */
  intent: z.string(),
  /**
   * Plain-language bullets describing what the user will see / experience once the
   * plan is applied. 3-6 entries, present tense, action-focused, **no file names or
   * code identifiers**. Renders prominently on the plan card; the `changes` list
   * below is kept for the apply turn but hidden from the UI.
   */
  userOutline: z.array(z.string()).default([]),
  changes: z.array(Kota0PlanChangeSchema).default([]),
  /**
   * Free-form list of "things from previous turns the user clearly still wants
   * preserved." Helps the user catch regressions; helps the apply turn keep prior
   * work in the file.
   */
  preserveExplicitly: z.array(z.string()).default([]),
  /**
   * Genuine open questions about scope only. The Mastra workflow auto-executes
   * regardless, so this field is purely informational — and the planner prompt
   * tells the model to leave it empty unless there is true ambiguity. Never
   * rhetorical "Shall I start?" prompts.
   */
  openQuestions: z.array(z.string()).default([]),
});

export type Kota0Plan = z.infer<typeof Kota0PlanSchema>;
export type Kota0PlanChange = z.infer<typeof Kota0PlanChangeSchema>;

export function planNeedsFullRewrite(plan: Kota0Plan): boolean {
  return plan.changes.some((c) => c.kind === "rewrite");
}

/**
 * Removal of a region the user explicitly asked to preserve is the dangerous case
 * the user described ("each subsequent prompt may erase older code updates"). The
 * UI uses this to disable auto-accept when set.
 */
export function planHasRiskyRemoval(plan: Kota0Plan): boolean {
  return plan.changes.some((c) => c.kind === "remove") && plan.preserveExplicitly.length > 0;
}

export function safeParseKota0Plan(content: string): { ok: true; plan: Kota0Plan } | { ok: false; reason: string } {
  if (!content || typeof content !== "string") {
    return { ok: false, reason: "empty_plan_content" };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch (e) {
    return { ok: false, reason: `plan_json_parse: ${e instanceof Error ? e.message : "unknown"}` };
  }
  const r = Kota0PlanSchema.safeParse(parsedJson);
  if (!r.success) {
    return { ok: false, reason: `plan_shape_invalid: ${r.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}` };
  }
  return { ok: true, plan: r.data };
}
