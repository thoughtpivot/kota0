/**
 * Kota0 chat workflow: classify → optional plan → auto-apply.
 * Invoked from `POST /api/kota0/apps/:appId/messages/stream`.
 */
import "@/lib/env";

import type { Plan } from "@/components/kota0/ai/plan/plan";
import {
  classifyComplexity,
  type ComplexityResult,
} from "@/components/kota0/ai/workflow/complexityClassifier";
import { recordAiTurnStats } from "@/components/kota0/ai/provider/aiProvider";
import { runPlanTurn } from "@/components/kota0/ai/plan/planAndApplyTurn";
import type { IncomingMessage } from "@/components/kota0/ai/plan/planRun";
import type {
  IdeationSystemExtras,
  ScribeBackendHeadMeta,
  ScribeHeadMeta,
} from "@/components/kota0/ai/plan/ideationRun";
import type { AppRevision } from "@/components/kota0/apps/data/AppHistoryRepository";

export type ChatWorkflowEvent =
  | { type: "classify"; complex: boolean; reason: string }
  | { type: "plan"; plan: Plan }
  | { type: "tool-call"; tool: string; summary: string }
  | { type: "text-delta"; delta: string }
  | { type: "error"; message: string };

/** Subset emitted by the apply path (text deltas + tool calls); forwarded by the workflow. */
export type ChatApplyEvent =
  | { type: "tool-call"; tool: string; summary: string }
  | { type: "text-delta"; delta: string };

export type ChatWorkflowInput = {
  appId: string;
  userText: string;
  incoming: IncomingMessage[];
  heads: { sfc: string; backend: string };
  sfcMeta: ScribeHeadMeta;
  backendMeta: ScribeBackendHeadMeta;
  extras: IdeationSystemExtras;
  priorRevisions: AppRevision[];
  freshStart?: boolean;
  lastAssistantDigest?: string;
  /** Persist plan row + run apply (wired by Kota0.backend). */
  persistPlan: (plan: Plan) => Promise<void>;
  runApply: (
    plan: Plan,
    onEvent?: (event: ChatApplyEvent) => void,
  ) => Promise<{ status: number; body: Record<string, unknown> }>;
  onEvent: (event: ChatWorkflowEvent) => void;
  /** Test hook — override classifier. */
  classifyFn?: (input: {
    userMessage: string;
    lastAssistantDigest?: string;
  }) => Promise<ComplexityResult>;
  /** Test hook — override plan turn. */
  runPlanFn?: typeof runPlanTurn;
};

export function narratorText(
  stage: "pre_classify" | "post_classify_complex" | "post_classify_trivial" | "post_plan",
  classifyReason?: string,
): string {
  switch (stage) {
    case "pre_classify":
      return "Reading your request and figuring out the right approach…";
    case "post_classify_complex":
      return `Looks like ${classifyReason?.trim() || "this needs more planning"}. Drafting a plan first.`;
    case "post_classify_trivial":
      return "Small change — jumping straight to it.";
    case "post_plan":
      return "Plan ready. Now executing:";
  }
}

function syntheticTrivialPlan(userText: string): Plan {
  const intent = userText.trim().slice(0, 200) || "(empty)";
  return {
    intent,
    userOutline: [intent],
    changes: [
      {
        file: "App.vue",
        summary: userText.trim().slice(0, 120) || "Apply user request",
        kind: "modify",
      },
    ],
    preserveExplicitly: [],
    openQuestions: [],
  };
}

/**
 * Run classify → plan (complex only) → apply. Emits SSE-shaped events via `onEvent`.
 */
export async function runChatWorkflow(
  input: ChatWorkflowInput,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const started = Date.now();
  const emit = input.onEvent;

  emit({ type: "text-delta", delta: narratorText("pre_classify") });

  const classify = input.classifyFn ?? classifyComplexity;
  const classification = await classify({
    userMessage: input.userText,
    lastAssistantDigest: input.lastAssistantDigest,
  });
  emit({
    type: "classify",
    complex: classification.complex,
    reason: classification.reason,
  });

  emit({
    type: "text-delta",
    delta: narratorText(
      classification.complex ? "post_classify_complex" : "post_classify_trivial",
      classification.reason,
    ),
  });

  let plan: Plan;

  if (classification.complex) {
    const runPlan = input.runPlanFn ?? runPlanTurn;
    const planResult = await runPlan({
      messages: input.incoming,
      heads: input.heads,
      sfcMeta: input.sfcMeta,
      backendMeta: input.backendMeta,
      extras: input.extras,
      priorRevisions: input.freshStart ? [] : input.priorRevisions,
      freshStart: input.freshStart ?? false,
    });
    plan = planResult.ok ? planResult.plan : planResult.stubPlan;
    await input.persistPlan(plan);
    emit({ type: "plan", plan });
    emit({ type: "text-delta", delta: narratorText("post_plan") });
  } else {
    plan = syntheticTrivialPlan(input.userText);
  }

  const outcome = await input.runApply(plan, (ev) => {
    emit(ev);
  });

  recordAiTurnStats({
    classifierComplex: classification.complex,
    classifierMs: classification.ms,
    totalMs: Date.now() - started,
  });

  return outcome;
}
