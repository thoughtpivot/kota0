import type { ChatRole } from "@/components/kota0/ai/chat.types";

/** Row payload in Scribe table `k0_chat_message`. */
export interface Kota0ChatMessageData {
  message_id: string;
  app_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export interface Kota0ChatMessageRow {
  message_id: string;
  app_id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  scribeRowId: number;
}

export interface Kota0ChatRepository {
  listByAppId(appId: string): Promise<Kota0ChatMessageRow[]>;
  appendMessage(input: {
    appId: string;
    role: ChatRole;
    content: string;
  }): Promise<Kota0ChatMessageRow>;
  deleteAllForApp(appId: string): Promise<void>;
  /** Remove one message row; no-op if not found. */
  deleteMessageById(appId: string, messageId: string): Promise<void>;
}
