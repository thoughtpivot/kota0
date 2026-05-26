/**
 * Deterministic apply path for build-mode ideation: when the client already has
 * full file contents from fenced ideation output, skip the LLM agent loop and
 * run the same tools (applyChanges → restartPreview → finish) directly.
 */
import type { Kota0Plan } from "@shared/kota0Plan.ts";
import {
  buildKota0AgentTools,
  type Kota0AgentToolContext,
} from "@/components/kota0/ai/tools/kota0AgentTools";

export type Kota0ProposedSources = {
  source?: string;
  backendSource?: string;
  bundleEnv?: string;
};

export type Kota0DeterministicApplyStep = {
  tool: string;
  summary: string;
  ok: boolean;
};

export type Kota0DeterministicApplyResult =
  | {
      ok: true;
      steps: Kota0DeterministicApplyStep[];
      finishSummary: string;
    }
  | {
      ok: false;
      steps: Kota0DeterministicApplyStep[];
      reason: string;
    };

export async function runKota0DeterministicApply(input: {
  ctx: Omit<Kota0AgentToolContext, "recordStep">;
  plan: Kota0Plan;
  proposedSources: Kota0ProposedSources;
  onEvent?: (event: { type: "tool-call"; tool: string; summary: string }) => void;
}): Promise<Kota0DeterministicApplyResult> {
  const steps: Kota0DeterministicApplyStep[] = [];
  const recordStep: Kota0AgentToolContext["recordStep"] = (step) => {
    steps.push(step);
    input.onEvent?.({ type: "tool-call", tool: step.tool, summary: step.summary });
  };

  const tools = buildKota0AgentTools({
    ...input.ctx,
    plan: input.plan,
    recordStep,
  });

  const toolOpts = {} as never;

  const { source, backendSource, bundleEnv } = input.proposedSources;
  if (source === undefined && backendSource === undefined && bundleEnv === undefined) {
    return { ok: false, steps, reason: "no_proposed_sources" };
  }

  const applyResult = (await tools.applyChanges.execute!(
    {
      ...(source !== undefined ? { source } : {}),
      ...(backendSource !== undefined ? { backendSource } : {}),
      ...(bundleEnv !== undefined ? { bundleEnv } : {}),
    },
    toolOpts,
  )) as { ok: boolean; reason?: string };

  if (!applyResult.ok) {
    return {
      ok: false,
      steps,
      reason: applyResult.reason ?? "apply_changes_failed",
    };
  }

  const restartResult = (await tools.restartPreview.execute!({}, toolOpts)) as {
    ok: boolean;
    snapshot?: { lastBuildError?: { kind?: string; module?: string } | null };
  };

  if (
    restartResult.snapshot?.lastBuildError?.kind === "missing_import" &&
    typeof restartResult.snapshot.lastBuildError.module === "string" &&
    restartResult.snapshot.lastBuildError.module.trim().length > 0
  ) {
    await tools.addBundleDependency.execute!(
      { packageName: restartResult.snapshot.lastBuildError.module.trim() },
      toolOpts,
    );
    await tools.restartPreview.execute!({}, toolOpts);
  } else if (!restartResult.ok) {
    return { ok: false, steps, reason: "restart_preview_failed" };
  }

  const finishSummary = input.plan.intent.trim()
    ? `Applied: ${input.plan.intent.trim()}`
    : "Applied generated changes from build mode.";
  await tools.finish.execute!({ summary: finishSummary }, toolOpts);

  return { ok: true, steps, finishSummary };
}
