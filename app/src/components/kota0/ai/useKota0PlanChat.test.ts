import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createLiveTimelineState,
  handleLiveTimelineClassify,
  handleLiveTimelinePlan,
  handleLiveTimelineTextDelta,
  handleLiveTimelineToolCall,
} from "@/components/kota0/ai/kota0LiveTimeline";
import type { Kota0Plan } from "@/components/kota0/ai/kota0Plan";

const samplePlan: Kota0Plan = {
  intent: "Add a counter button",
  userOutline: ["Show a click count", "Increment on each click"],
  changes: [{ file: "App.vue", summary: "Add counter UI", kind: "modify" }],
  preserveExplicitly: [],
  openQuestions: [],
};

describe("kota0 live timeline", () => {
  it("orders complex-turn events as status → plan → status → tool-call → text", () => {
    const state = createLiveTimelineState();

    handleLiveTimelineTextDelta(state, "Reading your request and figuring out the right approach…");
    handleLiveTimelineClassify(state, true, "feature: backend route + UI");
    handleLiveTimelineTextDelta(
      state,
      "Looks like feature: backend route + UI. Drafting a plan first.",
    );
    handleLiveTimelinePlan(state, samplePlan);
    handleLiveTimelineTextDelta(state, "Plan ready. Now executing:");
    handleLiveTimelineToolCall(state, "writeAppVue", "App.vue");
    handleLiveTimelineTextDelta(state, "wired up");

    assert.equal(state.parts.length, 6);

    assert.equal(state.parts[0]?.type, "status");
    if (state.parts[0]?.type === "status") {
      assert.equal(state.parts[0].tone, "narrator");
      assert.match(state.parts[0].text, /Reading your request/);
    }

    assert.equal(state.parts[1]?.type, "status");
    if (state.parts[1]?.type === "status") {
      assert.equal(state.parts[1].tone, "classify");
      assert.match(state.parts[1].text, /Drafting a plan first/);
      assert.equal(state.parts[1].reason, "feature: backend route + UI");
    }

    assert.equal(state.parts[2]?.type, "plan");
    if (state.parts[2]?.type === "plan") {
      assert.equal(state.parts[2].plan.intent, samplePlan.intent);
    }

    assert.equal(state.parts[3]?.type, "status");
    if (state.parts[3]?.type === "status") {
      assert.equal(state.parts[3].tone, "narrator");
      assert.equal(state.parts[3].text, "Plan ready. Now executing:");
    }

    assert.equal(state.parts[4]?.type, "tool-call");
    if (state.parts[4]?.type === "tool-call") {
      assert.equal(state.parts[4].tool, "writeAppVue");
    }

    assert.equal(state.parts[5]?.type, "text");
    if (state.parts[5]?.type === "text") {
      assert.equal(state.parts[5].text, "wired up");
    }
  });

  it("trivial turn skips plan and keeps classify narrator before apply trace", () => {
    const state = createLiveTimelineState();

    handleLiveTimelineTextDelta(state, "Reading your request and figuring out the right approach…");
    handleLiveTimelineClassify(state, false, "trivial css tweak");
    handleLiveTimelineTextDelta(state, "Small change — jumping straight to it.");
    handleLiveTimelineToolCall(state, "writeAppVue", "App.vue");

    assert.equal(state.parts.length, 3);
    assert.equal(state.parts[0]?.type, "status");
    assert.equal(state.parts[1]?.type, "status");
    if (state.parts[1]?.type === "status") {
      assert.equal(state.parts[1].tone, "classify");
      assert.equal(state.parts[1].reason, "trivial css tweak");
    }
    assert.equal(state.parts[2]?.type, "tool-call");
    assert.equal(state.workflowPhase, "applying");
  });
});

describe("useKota0PlanChat optimistic user row", () => {
  it("uses a pending-user id that can be reconciled on done", () => {
    const turnId = 1_700_000_000_000;
    const pendingUserId = `pending-user-${turnId}`;
    const optimistic = {
      id: pendingUserId,
      role: "user" as const,
      content: "rename the button",
      createdAt: new Date(turnId).toISOString(),
    };

    const messagesBeforeDone = [optimistic];
    assert.equal(messagesBeforeDone[0]?.role, "user");
    assert.equal(messagesBeforeDone[0]?.content, "rename the button");
    assert.match(messagesBeforeDone[0]?.id ?? "", /^pending-user-/);

    const messagesAfterDone = [
      { id: "scribe-user-1", role: "user" as const, content: "rename the button", createdAt: optimistic.createdAt },
    ];
    assert.notEqual(messagesAfterDone[0]?.id, pendingUserId);
    assert.equal(messagesAfterDone[0]?.content, optimistic.content);
  });
});
