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

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  kind?: ChatKind;
}
