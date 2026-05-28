/**
 * Kota0 chat workflow: classify → optional plan → auto-apply.
 * Invoked from `POST /api/kota0/apps/:appId/messages/stream`.
 */
import "@/lib/env";

import type { Kota0Plan } from "@shared/kota0Plan.ts";
import {
  classifyKota0Complexity,
  type Kota0ComplexityResult,
} from "@/components/kota0/ai/kota0ComplexityClassifier";
import { recordKota0AiTurnStats } from "@/components/kota0/ai/kota0AiProvider";
import { runKota0PlanTurn } from "@/components/kota0/ai/plan/kota0PlanAndApplyTurn";
import type { IncomingMessage } from "@/components/kota0/ai/plan/planRun";
import type {
  Kota0IdeationSystemExtras,
  Kota0ScribeBackendHeadMeta,
  Kota0ScribeHeadMeta,
} from "@/components/kota0/ai/plan/kota0IdeationRun";
import type { Kota0AppRevision } from "@/components/kota0/apps/ScribeKota0AppHistoryRepository";

export type Kota0ChatWorkflowEvent =
  | { type: "classify"; complex: boolean; reason: string }
  | { type: "plan"; plan: Kota0Plan }
  | { type: "tool-call"; tool: string; summary: string }
  | { type: "text-delta"; delta: string }
  | { type: "error"; message: string };

/** Subset emitted by the apply path (text deltas + tool calls); forwarded by the workflow. */
export type Kota0ChatApplyEvent =
  | { type: "tool-call"; tool: string; summary: string }
  | { type: "text-delta"; delta: string };

export type Kota0ChatWorkflowInput = {
  appId: string;
  userText: string;
  incoming: IncomingMessage[];
  heads: { sfc: string; backend: string };
  sfcMeta: Kota0ScribeHeadMeta;
  backendMeta: Kota0ScribeBackendHeadMeta;
  extras: Kota0IdeationSystemExtras;
  priorRevisions: Kota0AppRevision[];
  freshStart?: boolean;
  lastAssistantDigest?: string;
  /** Persist plan row + run apply (wired by Kota0.backend). */
  persistPlan: (plan: Kota0Plan) => Promise<void>;
  runApply: (
    plan: Kota0Plan,
    onEvent?: (event: Kota0ChatApplyEvent) => void,
  ) => Promise<{ status: number; body: Record<string, unknown> }>;
  onEvent: (event: Kota0ChatWorkflowEvent) => void;
  /** Test hook — override classifier. */
  classifyFn?: (input: {
    userMessage: string;
    lastAssistantDigest?: string;
  }) => Promise<Kota0ComplexityResult>;
  /** Test hook — override plan turn. */
  runPlanFn?: typeof runKota0PlanTurn;
};

function syntheticTrivialPlan(userText: string): Kota0Plan {
  return {
    intent: userText.trim().slice(0, 200) || "(empty)",
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
export async function runKota0ChatWorkflow(
  input: Kota0ChatWorkflowInput,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const started = Date.now();
  const emit = input.onEvent;

  const classify = input.classifyFn ?? classifyKota0Complexity;
  const classification = await classify({
    userMessage: input.userText,
    lastAssistantDigest: input.lastAssistantDigest,
  });
  emit({
    type: "classify",
    complex: classification.complex,
    reason: classification.reason,
  });

  let plan: Kota0Plan;

  if (classification.complex) {
    const runPlan = input.runPlanFn ?? runKota0PlanTurn;
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
  } else {
    plan = syntheticTrivialPlan(input.userText);
  }

  const outcome = await input.runApply(plan, (ev) => {
    emit(ev);
  });

  recordKota0AiTurnStats({
    classifierComplex: classification.complex,
    classifierMs: classification.ms,
    totalMs: Date.now() - started,
  });

  return outcome;
}
