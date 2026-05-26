/**
 * Build a deterministic `MockLanguageModelV3` that the agent loop can run
 * against. Each `scriptedTurn` produces one `doStream` invocation result; the
 * agent loop calls `doStream` once per step, executes the emitted tool calls,
 * and feeds their results back for the next step.
 *
 * Why this lives in scripts/: it's purely test infra for the eval harness, no
 * production code path imports from here.
 */
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

export type MockToolCall = {
  /** Tool name registered in `kota0AgentTools`. */
  name: string;
  /** Tool arguments matching the tool's input schema. */
  args: Record<string, unknown>;
};

export type MockScriptedTurn = {
  /** One or more tool calls the model emits in this step. */
  toolCalls: MockToolCall[];
  /** Optional text the model "says" alongside the tool calls. */
  text?: string;
};

function makeStreamForTurn(turn: MockScriptedTurn): {
  stream: ReadableStream<LanguageModelV3StreamPart>;
} {
  const parts: LanguageModelV3StreamPart[] = [];
  parts.push({ type: "stream-start", warnings: [] });
  parts.push({
    type: "response-metadata",
    id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    modelId: "mock-agent-model",
    timestamp: new Date(),
  });

  if (turn.text && turn.text.length > 0) {
    parts.push({ type: "text-start", id: "t0" });
    parts.push({ type: "text-delta", id: "t0", delta: turn.text });
    parts.push({ type: "text-end", id: "t0" });
  }

  for (let i = 0; i < turn.toolCalls.length; i += 1) {
    const tc = turn.toolCalls[i]!;
    const id = `tc-${i}`;
    const inputJson = JSON.stringify(tc.args ?? {});
    parts.push({ type: "tool-input-start", id, toolName: tc.name });
    parts.push({ type: "tool-input-delta", id, delta: inputJson });
    parts.push({ type: "tool-input-end", id });
    parts.push({
      type: "tool-call",
      toolCallId: id,
      toolName: tc.name,
      input: inputJson,
    });
  }

  parts.push({
    type: "finish",
    finishReason: {
      unified: turn.toolCalls.length > 0 ? "tool-calls" : "stop",
      raw: turn.toolCalls.length > 0 ? "tool_calls" : "stop",
    },
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
  });

  const stream = new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const p of parts) controller.enqueue(p);
      controller.close();
    },
  });
  return { stream };
}

/**
 * Build a mock model that consumes the scripted turns in order. Each call to
 * `doStream` returns the next turn's stream; once the script is exhausted, an
 * empty `stop` stream is returned so the agent loop terminates cleanly.
 */
export function buildMockAgentModel(scriptedTurns: MockScriptedTurn[]): MockLanguageModelV3 {
  let i = 0;
  return new MockLanguageModelV3({
    provider: "kota0-mock",
    modelId: "kota0-eval-mock",
    doStream: async () => {
      const turn = scriptedTurns[i] ?? { toolCalls: [] };
      i += 1;
      return makeStreamForTurn(turn);
    },
  });
}
