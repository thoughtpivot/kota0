import type { ChatRole } from "@/components/powervibe/ai/chat.types";

/** Row payload in Scribe table `nvibe_chat_message`. */
export interface PowervibeChatMessageData {
  message_id: string;
  app_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export interface PowervibeChatMessageRow {
  message_id: string;
  app_id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  scribeRowId: number;
}

export interface PowervibeChatRepository {
  listByAppId(appId: string): Promise<PowervibeChatMessageRow[]>;
  appendMessage(input: {
    appId: string;
    role: ChatRole;
    content: string;
  }): Promise<PowervibeChatMessageRow>;
  deleteAllForApp(appId: string): Promise<void>;
  /** Remove one message row; no-op if not found. */
  deleteMessageById(appId: string, messageId: string): Promise<void>;
}
