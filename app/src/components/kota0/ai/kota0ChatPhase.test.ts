import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import {
  findPendingPlan,
  getChatPhase,
  getThreadSlice,
  isFirstUserPrompt,
  isPlanConfirmation,
} from "@/components/kota0/ai/kota0ChatPhase";

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, "role" | "content">): ChatMessage {
  return {
    id: partial.id ?? "m1",
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    kind: partial.kind,
    ...partial,
  };
}

const samplePlan = JSON.stringify({
  intent: "add counter",
  changes: [{ file: "App.vue", summary: "add button", kind: "add" }],
  preserveExplicitly: [],
  openQuestions: [],
});

describe("kota0ChatPhase", () => {
  it("getThreadSlice starts after fresh_start", () => {
    const messages: ChatMessage[] = [
      msg({ id: "1", role: "user", content: "old" }),
      msg({ id: "2", role: "system", content: "fresh", kind: "fresh_start" }),
      msg({ id: "3", role: "user", content: "new" }),
    ];
    assert.equal(getThreadSlice(messages).length, 1);
    assert.equal(getThreadSlice(messages)[0]?.content, "new");
  });

  it("isFirstUserPrompt is true for empty thread", () => {
    assert.equal(isFirstUserPrompt([]), true);
    assert.equal(isFirstUserPrompt([msg({ role: "assistant", content: "hi", kind: "plan" })]), true);
  });

  it("isFirstUserPrompt is false after a user message in slice", () => {
    const messages = [msg({ role: "user", content: "build app" })];
    assert.equal(isFirstUserPrompt(messages), false);
  });

  it("findPendingPlan returns plan when no apply yet", () => {
    const messages = [
      msg({ role: "user", content: "build app" }),
      msg({ role: "assistant", content: samplePlan, kind: "plan" }),
    ];
    const plan = findPendingPlan(messages);
    assert.ok(plan);
    assert.equal(plan!.intent, "add counter");
  });

  it("findPendingPlan returns null after apply assistant message", () => {
    const messages = [
      msg({ role: "user", content: "build app" }),
      msg({ role: "assistant", content: samplePlan, kind: "plan" }),
      msg({ role: "user", content: "yes go ahead" }),
      msg({ role: "assistant", content: "Applied changes", kind: "message" }),
    ];
    assert.equal(findPendingPlan(messages), null);
  });

  it("isPlanConfirmation detects affirmatives and rejects questions", () => {
    assert.equal(isPlanConfirmation("yes, go ahead"), true);
    assert.equal(isPlanConfirmation("looks good"), true);
    assert.equal(isPlanConfirmation("What about mobile?"), false);
    assert.equal(isPlanConfirmation("Add a dark mode toggle and refactor the header"), false);
  });

  it("getChatPhase transitions plan → awaiting_confirm → iterate", () => {
    assert.equal(getChatPhase([]), "plan");

    const afterPlan = [
      msg({ role: "user", content: "build" }),
      msg({ role: "assistant", content: samplePlan, kind: "plan" }),
    ];
    assert.equal(getChatPhase(afterPlan), "awaiting_confirm");

    const afterApply = [
      ...afterPlan,
      msg({ role: "user", content: "yes" }),
      msg({ role: "assistant", content: "done", kind: "message" }),
    ];
    assert.equal(getChatPhase(afterApply), "iterate");
  });
});
