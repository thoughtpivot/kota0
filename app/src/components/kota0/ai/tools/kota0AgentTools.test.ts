import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildKota0AgentTools } from "@/components/kota0/ai/tools/kota0AgentTools";
import type { Kota0Plan } from "@/components/kota0/ai/kota0Plan";

const stubPlan: Kota0Plan = {
  intent: "test",
  userOutline: [],
  changes: [],
  preserveExplicitly: [],
  openQuestions: [],
};

describe("buildKota0AgentTools", () => {
  it("registers verifyAppConnectivity with probe route guidance", () => {
    const tools = buildKota0AgentTools({
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
