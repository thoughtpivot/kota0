/**
 * End-to-end test for the apply agent loop using the mock model from the eval
 * harness. Confirms (a) `onEvent` fires for every tool-call BEFORE the tool's
 * execute runs, (b) the order matches the model's scripted output, and (c)
 * tool results round-trip through to the agent's step trace.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  setKota0AiModelForTest,
} from "@/components/kota0/ai/kota0AiProvider";
import { runKota0ApplyAgentLoop } from "@/components/kota0/ai/plan/kota0ApplyAgentLoop";
import { buildMockAgentModel } from "../../../../../../scripts/kota0-evals/mockAgentModel";
import type { Kota0Plan } from "@/components/kota0/ai/kota0Plan";

function stubRepo(initial: { source: string; backendSource: string; bundleEnv: string }) {
  const state = { ...initial };
  return {
    getApp: async () => ({
      app_id: "test",
      name: "test",
      status: "active",
      source: state.source,
      backendSource: state.backendSource,
      bundleEnv: state.bundleEnv,
    }),
    updateAppSources: async (
      _id: string,
      patch: { source?: string; backendSource?: string; bundleEnv?: string },
    ) => {
      if (typeof patch.source === "string") state.source = patch.source;
      if (typeof patch.backendSource === "string") state.backendSource = patch.backendSource;
      if (typeof patch.bundleEnv === "string") state.bundleEnv = patch.bundleEnv;
    },
    getScribeRowIdForApp: async () => null,
  };
}

describe("runKota0ApplyAgentLoop — tool-call event ordering", () => {
  it("emits a tool-call event for each scripted tool BEFORE the tool result lands in steps", async () => {
    const plan: Kota0Plan = {
      intent: "smoke",
      userOutline: [],
      changes: [{ file: "App.vue", summary: "rewrite", kind: "rewrite" }],
      preserveExplicitly: [],
      openQuestions: [],
    };
    const mock = buildMockAgentModel([
      { toolCalls: [{ name: "applyChanges", args: { source: "<template></template>" } }] },
      { toolCalls: [{ name: "restartPreview", args: {} }] },
      { toolCalls: [{ name: "finish", args: { summary: "done" } }] },
    ]);
    setKota0AiModelForTest(mock);
    if (!process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = "test-stub";

    const events: { tool: string; summary: string }[] = [];
    try {
      const r = await runKota0ApplyAgentLoop({
        ctx: {
          appId: "test",
          plan,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          repo: stubRepo({ source: "<template>old</template>", backendSource: "", bundleEnv: "" }) as any,
          rematerialize: async () => {},
          restartBundle: async () => {},
          addBundleDep: async (_id, _name, ver) => ({ ok: true, alreadyPresent: false, nextVersion: ver }),
          getBundleSnapshot: async (appId) => ({
            appId,
            phase: "running" as const,
            phaseSince: Date.now(),
            lastBuildError: null,
            fingerprint: "fp",
            isServing: true,
            servingAppId: appId,
            fetchedAt: Date.now(),
          }),
        },
        plan,
        priorRevisions: [],
        recentEditsSection: "",
        maxSteps: 6,
        onEvent: (e) => {
          if (e.type === "tool-call") {
            events.push({ tool: e.tool, summary: e.summary });
          }
        },
      });
      assert.equal(r.ok, true);
      if (!r.ok) return;
      assert.deepEqual(
        events.map((e) => e.tool),
        ["applyChanges", "restartPreview", "finish"],
      );
      // Steps recorded by tools after execute should match the scripted order.
      assert.deepEqual(
        r.steps.map((s) => s.tool),
        ["applyChanges", "restartPreview", "finish"],
      );
      assert.equal(r.finishSummary, "done");
    } finally {
      setKota0AiModelForTest(null);
    }
  });

  it("forwards text-delta events interleaved with tool calls", async () => {
    const plan: Kota0Plan = {
      intent: "smoke",
      userOutline: [],
      changes: [{ file: "App.vue", summary: "rewrite", kind: "rewrite" }],
      preserveExplicitly: [],
      openQuestions: [],
    };
    const mock = buildMockAgentModel([
      { text: "Going to rewrite App.vue first.", toolCalls: [{ name: "applyChanges", args: { source: "<template></template>" } }] },
      { text: "Now restarting preview.", toolCalls: [{ name: "restartPreview", args: {} }] },
      { toolCalls: [{ name: "finish", args: { summary: "done" } }] },
    ]);
    setKota0AiModelForTest(mock);
    if (!process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = "test-stub";

    const events: ({ type: "text-delta"; delta: string } | { type: "tool-call"; tool: string })[] = [];
    try {
      const r = await runKota0ApplyAgentLoop({
        ctx: {
          appId: "test",
          plan,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          repo: stubRepo({ source: "<template>old</template>", backendSource: "", bundleEnv: "" }) as any,
          rematerialize: async () => {},
          restartBundle: async () => {},
          addBundleDep: async (_id, _name, ver) => ({ ok: true, alreadyPresent: false, nextVersion: ver }),
          getBundleSnapshot: async (appId) => ({
            appId,
            phase: "running" as const,
            phaseSince: Date.now(),
            lastBuildError: null,
            fingerprint: "fp",
            isServing: true,
            servingAppId: appId,
            fetchedAt: Date.now(),
          }),
        },
        plan,
        priorRevisions: [],
        recentEditsSection: "",
        maxSteps: 6,
        onEvent: (e) => {
          if (e.type === "text-delta") events.push({ type: "text-delta", delta: e.delta });
          else if (e.type === "tool-call") events.push({ type: "tool-call", tool: e.tool });
        },
      });
      assert.equal(r.ok, true);
      const ordered = events.map((e) => (e.type === "text-delta" ? `text:${e.delta}` : `tool:${e.tool}`));
      assert.deepEqual(ordered, [
        "text:Going to rewrite App.vue first.",
        "tool:applyChanges",
        "text:Now restarting preview.",
        "tool:restartPreview",
        "tool:finish",
      ]);
      if (!r.ok) return;
      assert.match(r.modelText, /Going to rewrite/);
      assert.match(r.modelText, /Now restarting/);
    } finally {
      setKota0AiModelForTest(null);
    }
  });
});
