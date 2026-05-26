import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import { shouldArmAutoApplyAfterSend } from "@/components/kota0/ai/kota0AutoApply";

const planRow: ChatMessage = {
  id: "p1",
  role: "assistant",
  content: JSON.stringify({ intent: "x", changes: [] }),
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "plan",
};

describe("kota0AutoApply", () => {
  it("does not arm in plan mode", () => {
    assert.equal(shouldArmAutoApplyAfterSend([], true), false);
    assert.equal(shouldArmAutoApplyAfterSend([planRow], true), false);
  });

  it("does not arm in build mode when a plan is pending confirmation", () => {
    assert.equal(shouldArmAutoApplyAfterSend([planRow], false), false);
  });

  it("arms in build mode when no plan is pending", () => {
    assert.equal(shouldArmAutoApplyAfterSend([], false), true);
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
    assert.equal(shouldArmAutoApplyAfterSend(iterateThread, false), true);
  });
});
