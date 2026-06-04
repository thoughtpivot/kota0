import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAgentTools } from "@/components/kota0/ai/tools/agentTools";
import type { Plan } from "@/components/kota0/ai/plan/plan";

const stubPlan: Plan = {
  intent: "test",
  userOutline: [],
  changes: [],
  preserveExplicitly: [],
  openQuestions: [],
};

describe("buildAgentTools", () => {
  it("registers verifyAppConnectivity with probe route guidance", () => {
    const tools = buildAgentTools({
      appId: "test-app",
      plan: stubPlan,
      repo: {} as never,
      rematerialize: async () => {},
      recordStep: () => {},
    });
    assert.ok("verifyAppConnectivity" in tools);
    const t = tools.verifyAppConnectivity;
    assert.match(String(t.description), /\/api\/kota0-app\/hello/);
  });
});
