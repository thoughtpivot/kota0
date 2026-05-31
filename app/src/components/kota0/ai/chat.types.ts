import type { Kota0Plan } from "@/components/kota0/ai/kota0Plan";

export type Kota0WorkflowPhase = "idle" | "classifying" | "planning" | "applying" | "done";

export type ChatRole = "user" | "assistant" | "system";

/**
 * Mirrors `Kota0ChatMessageKind` in `kota0ChatTypes.ts` — kept duplicated so this
 * type module stays free of node imports for browser callers.
 *  - `"message"`: ordinary chat content (default for legacy rows).
 *  - `"plan"`: assistant turn whose `content` is a JSON-encoded plan envelope; the
 *    chat UI renders it as a read-only card. Apply runs after the user confirms in chat.
 *  - `"fresh_start"`: user marker that future plan turns should ignore prior
 *    conversation context and treat HEAD as the only source of truth.
 */
export type ChatKind = "message" | "plan" | "fresh_start";

/**
 * One interleaved chunk inside an assistant turn. The full assistant message is the
 * ordered sequence of these parts — text deltas, tool invocations, and (when available)
 * tool results, in the order the agent loop emitted them. `content` remains as a plain-text
 * fallback for renderers/exports that can't iterate parts.
 */
export type Kota0MessagePart =
  | { type: "text"; text: string }
  | { type: "status"; text: string; tone?: "narrator" | "classify"; reason?: string; at: number }
  | { type: "plan"; plan: Kota0Plan; at: number }
  | { type: "tool-call"; tool: string; summary: string; at: number }
  | { type: "tool-result"; tool: string; ok: boolean; summary?: string; at: number };

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  kind?: ChatKind;
  /** Interleaved reasoning + tool calls for assistant turns. Absent on legacy rows. */
  parts?: Kota0MessagePart[];
}
