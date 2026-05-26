/**
 * Eval harness runner — runs each fixture's scripted turns through the real
 * `runKota0ApplyAgentLoop` with a `MockLanguageModelV3` injected via
 * `setKota0AiModelForTest`. Stubs the repo + rematerialize so no Scribe / Docker
 * is required. Scorers compare resulting persistence + step trace against the
 * fixture's `expect` block. Non-zero exit on any failure for CI.
 */
import { setKota0AiModelForTest } from "@/components/kota0/ai/kota0AiProvider";
import { runKota0ApplyAgentLoop } from "@/components/kota0/ai/plan/kota0ApplyAgentLoop";

import { buildMockAgentModel } from "./mockAgentModel";
import { KOTA0_EVAL_SCORERS, type Kota0EvalRunContext } from "./scorers";
import type { Kota0EvalFixture } from "./types";

import { fixture as newAppRewrite } from "./fixtures/newAppRewrite";
import { fixture as incrementalModify } from "./fixtures/incrementalModify";
import { fixture as missingDepSelfCorrect } from "./fixtures/missingDepSelfCorrect";

const FIXTURES: Kota0EvalFixture[] = [newAppRewrite, incrementalModify, missingDepSelfCorrect];

/**
 * Minimal repo stub matching the surface `runKota0ApplyAgentLoop` + its tools
 * use. Keeps an in-memory copy of the app's `source` / `backendSource` /
 * `bundleEnv` so `getCurrentSource` and `applyChanges` work end-to-end.
 */
function buildStubRepo(initial: Kota0EvalFixture["initialHead"]): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional broad type to satisfy the agent context
  repo: any;
  persisted: { source: boolean; backendSource: boolean; bundleEnv: boolean };
} {
  const state = {
    source: initial.source,
    backendSource: initial.backendSource,
    bundleEnv: initial.bundleEnv,
  };
  const persisted = { source: false, backendSource: false, bundleEnv: false };
  const repo = {
    getApp: async (_id: string) => ({
      app_id: "eval-app",
      name: "eval-app",
      status: "active",
      source: state.source,
      backendSource: state.backendSource,
      bundleEnv: state.bundleEnv,
    }),
    updateAppSources: async (
      _id: string,
      patch: { source?: string; backendSource?: string; bundleEnv?: string },
    ) => {
      if (typeof patch.source === "string" && patch.source !== state.source) {
        state.source = patch.source;
        persisted.source = true;
      }
      if (typeof patch.backendSource === "string" && patch.backendSource !== state.backendSource) {
        state.backendSource = patch.backendSource;
        persisted.backendSource = true;
      }
      if (typeof patch.bundleEnv === "string" && patch.bundleEnv !== state.bundleEnv) {
        state.bundleEnv = patch.bundleEnv;
        persisted.bundleEnv = true;
      }
    },
    getScribeRowIdForApp: async (_id: string) => null,
  };
  return { repo, persisted };
}

async function runOneFixture(fixture: Kota0EvalFixture): Promise<{
  pass: boolean;
  scoreLines: { name: string; pass: boolean; message: string }[];
  diagnostics: string[];
}> {
  // Inject the scripted model. Reset after this fixture regardless of outcome.
  const mock = buildMockAgentModel(fixture.scriptedTurns);
  setKota0AiModelForTest(mock as unknown as ReturnType<typeof buildMockAgentModel>);
  // The agent loop's GEMINI_API_KEY check is bypassed by the test override —
  // but the loop still checks it. Set a dummy so it passes.
  if (!process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = "eval-stub-key";

  const { repo, persisted } = buildStubRepo(fixture.initialHead);
  // Track in-memory "installed deps" so addBundleDependency is observable.
  const installedDeps = new Set<string>();
  try {
    const agentResult = await runKota0ApplyAgentLoop({
      ctx: {
        appId: "eval-app",
        plan: fixture.plan,
        repo,
        rematerialize: async () => {
          /* no-op — evals don't spin up a real bundle. */
        },
        restartBundle: async () => {
          /* no-op — evals don't spin up a real bundle. */
        },
        addBundleDep: async (_appId, packageName, version) => {
          const already = installedDeps.has(packageName);
          installedDeps.add(packageName);
          return { ok: true, alreadyPresent: already, nextVersion: version };
        },
        getBundleSnapshot: async (appId) => ({
          appId,
          phase: "running" as const,
          phaseSince: Date.now(),
          lastBuildError: null,
          fingerprint: "eval-fingerprint",
          isServing: true,
          servingAppId: appId,
          fetchedAt: Date.now(),
        }),
      },
      plan: fixture.plan,
      priorRevisions: [],
      recentEditsSection: "",
      maxSteps: Math.max(fixture.scriptedTurns.length + 2, 6),
    });

    const ctx: Kota0EvalRunContext = { agentResult, persisted };
    const scoreLines = KOTA0_EVAL_SCORERS.map((s) => ({
      name: s.name,
      ...s.run(ctx, fixture),
    }));
    const pass = scoreLines.every((x) => x.pass);
    const diagnostics: string[] = [];
    if (!agentResult.ok) {
      diagnostics.push(`agent loop reason: ${agentResult.reason}`);
    }
    diagnostics.push(
      `steps: ${agentResult.steps.map((s) => `${s.tool}${s.ok ? "" : "(!)"}`).join(" → ") || "(none)"}`,
    );
    return { pass, scoreLines, diagnostics };
  } finally {
    setKota0AiModelForTest(null);
  }
}

async function main(): Promise<void> {
  const results: { fixture: string; pass: boolean; lines: string[] }[] = [];
  for (const fixture of FIXTURES) {
    process.stdout.write(`\n▶ ${fixture.name}\n  ${fixture.description}\n`);
    const r = await runOneFixture(fixture);
    const lines: string[] = [];
    for (const s of r.scoreLines) {
      lines.push(`    ${s.pass ? "✓" : "✗"} ${s.name}: ${s.message}`);
    }
    for (const d of r.diagnostics) {
      lines.push(`    · ${d}`);
    }
    process.stdout.write(lines.join("\n") + "\n");
    results.push({ fixture: fixture.name, pass: r.pass, lines });
  }

  const passCount = results.filter((r) => r.pass).length;
  const failCount = results.length - passCount;
  process.stdout.write(
    `\nkota0:evals — ${passCount} passed, ${failCount} failed (${results.length} fixtures)\n`,
  );
  if (failCount > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("[kota0:evals] runner crashed:", e);
  process.exit(2);
});
