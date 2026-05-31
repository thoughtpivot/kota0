/**
 * One-shot Kota0 chat turn — the fast default (no orchestrator, no tools).
 *
 * A single model call returns markdown that may contain at most one full-file
 * ```vue / ```ts / ```env fence (the legacy "ideation" contract). The reply is
 * streamed to chat verbatim — so the code shows, Shiki-highlighted — and the
 * fences are extracted here for the caller to auto-apply. A purely informational
 * reply has no fence and applies nothing.
 *
 * Contrast with the agentic path (`kota0ChatWorkflow` → `kota0ApplyAgentLoop`),
 * which writes files via tools and therefore never surfaces code in chat.
 */
import "@/lib/env";

import { parse as parseSfc } from "@vue/compiler-sfc";
import { APICallError, type ModelMessage } from "ai";
import { extractTsFenceFromMarkdown } from "@/components/kota0/ai/kota0ExtractBackendFence";
import { extractEnvFenceFromMarkdown } from "@/components/kota0/ai/kota0ExtractEnvFence";
import { extractVueFenceFromMarkdown } from "@/components/kota0/ai/kota0ExtractVueFence";
import {
  kota0AiModelDescription,
  kota0AiStream,
} from "@/components/kota0/ai/kota0AiProvider";
import type { IncomingMessage } from "./planRun";
import {
  buildKota0OneShotSystemInstruction,
  type Kota0IdeationSystemExtras,
  type Kota0ScribeBackendHeadMeta,
  type Kota0ScribeHeadMeta,
} from "./kota0IdeationRun";

export type Kota0OneShotTurnResult =
  | {
      ok: true;
      /** Full model markdown — persist as the assistant message so code renders in chat. */
      markdown: string;
      /** Full `App.vue` from a ```vue fence, validated as a parseable SFC; null if absent/invalid. */
      proposedSource: string | null;
      /** Full `App.backend.ts` from a ```ts fence; null if absent. */
      proposedBackend: string | null;
      /** Full bundle `.env` from a ```env fence; null if absent. */
      proposedEnv: string | null;
    }
  | { ok: false; reason: string };

function buildOneShotContents(messages: IncomingMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/** A ```vue fence is only honoured if it parses as a valid SFC — never auto-apply broken code. */
export function validKota0VueFence(text: string): string | null {
  const fence = extractVueFenceFromMarkdown(text);
  if (!fence || fence.trim().length === 0) return null;
  const { errors } = parseSfc(fence, { filename: "App.vue" });
  return errors.length === 0 ? fence : null;
}

function formatAiError(e: unknown): string {
  const desc = kota0AiModelDescription();
  if (APICallError.isInstance(e)) return `${e.message} (model=${desc.modelId})`;
  return e instanceof Error ? e.message : "unknown_error";
}

/**
 * Run the one-shot turn. Streams text deltas through `onTextDelta` (for live SSE)
 * and returns the full markdown + extracted fences. Relies on the provider to throw
 * if `GEMINI_API_KEY` is missing (a `setKota0AiModelForTest` override bypasses that),
 * mirroring `runKota0ApplyAgentLoop`.
 */
export async function runKota0OneShotTurn(input: {
  messages: IncomingMessage[];
  heads: { sfc: string; backend: string };
  sfcMeta: Kota0ScribeHeadMeta;
  backendMeta: Kota0ScribeBackendHeadMeta;
  extras: Kota0IdeationSystemExtras;
  recentEditsSection?: string;
  onTextDelta?: (delta: string) => void;
}): Promise<Kota0OneShotTurnResult> {
  if (input.messages.length === 0) {
    return { ok: false, reason: "no_messages" };
  }
  const system = buildKota0OneShotSystemInstruction(
    input.heads,
    input.sfcMeta,
    input.backendMeta,
    input.extras,
    { recentEditsSection: input.recentEditsSection },
  );
  const messages = buildOneShotContents(input.messages);

  let streamedText = "";
  try {
    const result = await kota0AiStream({
      system,
      messages,
      // No tools — a single generation step. The cap is belt-and-suspenders.
      maxSteps: 1,
      onChunk: (chunk) => {
        if (chunk.type === "text-delta" && "payload" in chunk) {
          const p = chunk.payload as { text?: string };
          if (typeof p.text === "string" && p.text.length > 0) {
            streamedText += p.text;
            input.onTextDelta?.(p.text);
          }
        }
      },
    });
    const markdown = (result.text?.trim() ? result.text : streamedText).trim();
    if (!markdown) {
      return { ok: false, reason: "empty_model_content" };
    }
    const ts = extractTsFenceFromMarkdown(markdown);
    const env = extractEnvFenceFromMarkdown(markdown);
    return {
      ok: true,
      markdown,
      proposedSource: validKota0VueFence(markdown),
      proposedBackend: ts && ts.trim().length > 0 ? ts.trim() : null,
      proposedEnv: env && env.trim().length > 0 ? env.trim() : null,
    };
  } catch (e) {
    return { ok: false, reason: formatAiError(e) };
  }
}
