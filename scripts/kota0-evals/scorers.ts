import type { Kota0EvalFixture } from "./types";
import type { Kota0AgentStep, Kota0ApplyAgentResult } from "../../app/src/components/kota0/ai/plan/kota0ApplyAgentLoop";

export type Kota0EvalScoreOutcome = {
  pass: boolean;
  message: string;
};

export type Kota0EvalRunContext = {
  agentResult: Kota0ApplyAgentResult;
  persisted: {
    source: boolean;
    backendSource: boolean;
    bundleEnv: boolean;
  };
};

export type Kota0EvalScorer = (
  ctx: Kota0EvalRunContext,
  fixture: Kota0EvalFixture,
) => Kota0EvalScoreOutcome;

function steps(agentResult: Kota0ApplyAgentResult): Kota0AgentStep[] {
  return agentResult.ok ? agentResult.steps : agentResult.steps;
}

export const scoreFinishCalled: Kota0EvalScorer = (ctx, fixture) => {
  const hasFinish = steps(ctx.agentResult).some((s) => s.tool === "finish");
  if (hasFinish === fixture.expect.finishCalled) {
    return { pass: true, message: `finishCalled=${hasFinish}` };
  }
  return {
    pass: false,
    message: `expected finishCalled=${fixture.expect.finishCalled}, got ${hasFinish}`,
  };
};

export const scoreFilesChanged: Kota0EvalScorer = (ctx, fixture) => {
  const expected = fixture.expect;
  const checks: string[] = [];
  let pass = true;
  if (expected.sourceChanged !== ctx.persisted.source) {
    pass = false;
    checks.push(`source: expected ${expected.sourceChanged}, got ${ctx.persisted.source}`);
  }
  if (expected.backendChanged !== ctx.persisted.backendSource) {
    pass = false;
    checks.push(`backendSource: expected ${expected.backendChanged}, got ${ctx.persisted.backendSource}`);
  }
  if (expected.envChanged !== ctx.persisted.bundleEnv) {
    pass = false;
    checks.push(`bundleEnv: expected ${expected.envChanged}, got ${ctx.persisted.bundleEnv}`);
  }
  return pass
    ? { pass: true, message: "filesChanged matches" }
    : { pass: false, message: checks.join("; ") };
};

export const scoreStepBudget: Kota0EvalScorer = (ctx, fixture) => {
  const n = steps(ctx.agentResult).length;
  if (n <= fixture.expect.maxSteps) {
    return { pass: true, message: `${n}/${fixture.expect.maxSteps} steps` };
  }
  return { pass: false, message: `${n} steps > maxSteps ${fixture.expect.maxSteps}` };
};

export const scoreOnlyTouchesPlannedFiles: Kota0EvalScorer = (ctx, fixture) => {
  if (!fixture.expect.onlyTouchesPlannedFiles) return { pass: true, message: "(not enforced)" };
  const plannedFiles = new Set(fixture.plan.changes.map((c) => c.file));
  const stray: string[] = [];
  if (ctx.persisted.source && !plannedFiles.has("App.vue")) stray.push("App.vue");
  if (ctx.persisted.backendSource && !plannedFiles.has("App.backend.ts")) stray.push("App.backend.ts");
  if (ctx.persisted.bundleEnv && !plannedFiles.has(".env")) stray.push(".env");
  if (stray.length === 0) return { pass: true, message: "only planned files touched" };
  return { pass: false, message: `unplanned files written: ${stray.join(", ")}` };
};

export const scoreNoFailingMutations: Kota0EvalScorer = (ctx) => {
  const MUTATING = new Set(["applyChanges", "applyPatch", "addBundleDependency", "restartPreview"]);
  const failed = steps(ctx.agentResult).filter((s) => MUTATING.has(s.tool) && !s.ok);
  if (failed.length === 0) return { pass: true, message: "no failing mutations" };
  return {
    pass: false,
    message: failed.map((s) => `${s.tool}: ${s.summary}`).join("; "),
  };
};

export const KOTA0_EVAL_SCORERS: { name: string; run: Kota0EvalScorer }[] = [
  { name: "finishCalled", run: scoreFinishCalled },
  { name: "filesChanged", run: scoreFilesChanged },
  { name: "stepBudget", run: scoreStepBudget },
  { name: "onlyPlannedFiles", run: scoreOnlyTouchesPlannedFiles },
  { name: "noFailingMutations", run: scoreNoFailingMutations },
];
