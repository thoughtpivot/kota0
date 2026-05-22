import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import {
  isAutoApplyDeferredByPlanPhase,
  shouldArmAutoApplyAfterSend,
} from "@/components/kota0/ai/kota0AutoApply";

const planRow: ChatMessage = {
  id: "p1",
  role: "assistant",
  content: JSON.stringify({ intent: "x", changes: [] }),
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "plan",
};

describe("kota0AutoApply", () => {
  it("arms on any send when plan-first is off", () => {
    assert.equal(shouldArmAutoApplyAfterSend([], true, false), true);
    assert.equal(shouldArmAutoApplyAfterSend([planRow], true, false), true);
  });

  it("does not arm during plan or awaiting_confirm when plan-first is on", () => {
    assert.equal(shouldArmAutoApplyAfterSend([], true, true), false);
    assert.equal(shouldArmAutoApplyAfterSend([planRow], true, true), false);
    assert.equal(isAutoApplyDeferredByPlanPhase([], true, true), true);
    assert.equal(isAutoApplyDeferredByPlanPhase([planRow], true, true), true);
  });

  it("arms in iterate phase when plan-first is on", () => {
    const iterateThread: ChatMessage[] = [
      planRow,
      {
        id: "u1",
        role: "user",
        content: "yes",
        createdAt: "2026-01-01T00:01:00.000Z",
      },
      {
        id: "a1",
        role: "assistant",
        content: "Applied: x",
        createdAt: "2026-01-01T00:02:00.000Z",
      },
    ];
    assert.equal(shouldArmAutoApplyAfterSend(iterateThread, true, true), true);
    assert.equal(isAutoApplyDeferredByPlanPhase(iterateThread, true, true), false);
  });
});
