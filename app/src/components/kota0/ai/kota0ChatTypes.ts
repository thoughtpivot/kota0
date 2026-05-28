import type { ChatRole, Kota0MessagePart } from "@/components/kota0/ai/chat.types";

/**
 * Discriminator on `data.kind` that distinguishes regular chat content from structured
 * plan / control messages introduced by the two-turn ideation flow. Older rows have no
 * `kind` field — readers must default those to `"message"`.
 */
export type Kota0ChatMessageKind = "message" | "plan" | "fresh_start";

/** Row payload in Scribe table `k0_chat_message`. */
export interface Kota0ChatMessageData {
  message_id: string;
  app_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  /** Defaults to `"message"` when absent (legacy rows). */
  kind?: Kota0ChatMessageKind;
  /**
   * Interleaved reasoning + tool calls captured during the agent loop. Absent on legacy
   * rows and on rows from non-assistant turns. Stored verbatim so re-renders show the same
   * view the user saw live.
   */
  parts?: Kota0MessagePart[];
}

export interface Kota0ChatMessageRow {
  message_id: string;
  app_id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  scribeRowId: number;
  kind: Kota0ChatMessageKind;
  parts?: Kota0MessagePart[];
}

export interface Kota0ChatRepository {
  listByAppId(appId: string): Promise<Kota0ChatMessageRow[]>;
  appendMessage(input: {
    appId: string;
    role: ChatRole;
    content: string;
    kind?: Kota0ChatMessageKind;
    parts?: Kota0MessagePart[];
  }): Promise<Kota0ChatMessageRow>;
  deleteAllForApp(appId: string): Promise<void>;
  /** Remove one message row; no-op if not found. */
  deleteMessageById(appId: string, messageId: string): Promise<void>;
}
