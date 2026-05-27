import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import {
  getChatPhase,
  getThreadSlice,
  isFirstUserPrompt,
} from "@/components/kota0/ai/kota0ChatPhase";

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, "role" | "content">): ChatMessage {
  return {
    id: partial.id ?? "m1",
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    kind: partial.kind,
    ...partial,
  };
}

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

  it("getChatPhase is plan for first prompt then iterate", () => {
    assert.equal(getChatPhase([]), "plan");
    const afterUser = [msg({ role: "user", content: "build" })];
    assert.equal(getChatPhase(afterUser), "iterate");
  });
});
