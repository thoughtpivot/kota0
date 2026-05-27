import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import {
  getQaTailSincePlan,
  getThreadSlice,
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

  it("getQaTailSincePlan returns user/assistant turns after last plan row", () => {
    const messages: ChatMessage[] = [
      msg({ id: "1", role: "user", content: "build app" }),
      msg({ id: "2", role: "assistant", content: '{"intent":"x","changes":[]}', kind: "plan" }),
      msg({ id: "3", role: "user", content: "follow up" }),
      msg({ id: "4", role: "assistant", content: "done" }),
    ];
    const tail = getQaTailSincePlan(messages);
    assert.equal(tail.length, 2);
    assert.equal(tail[0]?.content, "follow up");
    assert.equal(tail[1]?.content, "done");
  });

  it("getQaTailSincePlan is empty when no plan row", () => {
    assert.deepEqual(getQaTailSincePlan([msg({ role: "user", content: "hi" })]), []);
  });
});
