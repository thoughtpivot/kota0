/**
 * Chat → Gemini conversion: historical ```vue fence stripping by AI mode.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { chatRowsToGeminiIncoming } from "@/components/kota0/ai/chat/chatForModel";
import type { ChatMessageRow } from "@/components/kota0/ai/chat/chatTypes";

const OMIT_PLACEHOLDER =
  "[omitted previous proposed App.vue; use Scribe HEAD in system prompt — not the live file]";

function row(role: ChatMessageRow["role"], content: string): ChatMessageRow {
  return {
    message_id: crypto.randomUUID(),
    app_id: "test-app",
    role,
    content,
    createdAt: new Date().toISOString(),
    scribeRowId: 1,
    kind: "message",
  };
}

describe("chatRowsToGeminiIncoming vue fence stripping", () => {
  const prevOmit = process.env.K0_CHAT_OMIT_HISTORICAL_VUE_FENCES;

  beforeEach(() => {
    process.env.K0_CHAT_OMIT_HISTORICAL_VUE_FENCES = "true";
  });

  afterEach(() => {
    if (prevOmit === undefined) delete process.env.K0_CHAT_OMIT_HISTORICAL_VUE_FENCES;
    else process.env.K0_CHAT_OMIT_HISTORICAL_VUE_FENCES = prevOmit;
  });

  it("agentic: strips older vue fences but keeps last assistant row", () => {
    const rows: ChatMessageRow[] = [
      row("user", "build app"),
      row("assistant", "Done.\n```vue\n<template><p>v1</p></template>\n```"),
      row("user", "what is this?"),
      row("assistant", "It is a demo app with no code change."),
    ];
    const incoming = chatRowsToGeminiIncoming(rows, { aiMode: "agentic" });
    const assistantContents = incoming.filter((m) => m.role === "assistant").map((m) => m.content);
    assert.equal(assistantContents.length, 2);
    assert.ok(assistantContents[0]!.includes(OMIT_PLACEHOLDER));
    assert.match(assistantContents[1]!, /demo app/);
    assert.doesNotMatch(assistantContents[1]!, /```vue/);
  });

  it("oneshot: keeps last assistant row with vue fence when Q&A follows", () => {
    const rows: ChatMessageRow[] = [
      row("user", "build app"),
      row("assistant", "Done.\n```vue\n<template><p>v1</p></template>\n```"),
      row("user", "what is this?"),
      row("assistant", "It is a demo app with no code change."),
    ];
    const incoming = chatRowsToGeminiIncoming(rows, { aiMode: "oneshot" });
    const assistantContents = incoming.filter((m) => m.role === "assistant").map((m) => m.content);
    assert.equal(assistantContents.length, 2);
    assert.match(assistantContents[0]!, /```vue/);
    assert.match(assistantContents[0]!, /v1/);
    assert.match(assistantContents[1]!, /demo app/);
  });

  it("respects K0_CHAT_OMIT_HISTORICAL_VUE_FENCES=false", () => {
    process.env.K0_CHAT_OMIT_HISTORICAL_VUE_FENCES = "false";
    const rows: ChatMessageRow[] = [
      row("user", "build"),
      row("assistant", "```vue\n<template><p>v1</p></template>\n```"),
      row("user", "again"),
      row("assistant", "prose only"),
    ];
    const incoming = chatRowsToGeminiIncoming(rows, { aiMode: "oneshot" });
    const firstAssistant = incoming.find((m) => m.role === "assistant");
    assert.match(firstAssistant!.content, /```vue/);
    assert.ok(!firstAssistant!.content.includes(OMIT_PLACEHOLDER));
  });
});
