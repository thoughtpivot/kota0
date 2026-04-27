import type { ChatRole } from "@/types/chat";

/** Row payload in Scribe table `nvibe_chat_message`. */
export interface NvibeChatMessageData {
  message_id: string;
  app_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export interface NvibeChatMessageRow {
  message_id: string;
  app_id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  scribeRowId: number;
}

export interface NvibeChatRepository {
  listByAppId(appId: string): Promise<NvibeChatMessageRow[]>;
  appendMessage(input: {
    appId: string;
    role: ChatRole;
    content: string;
  }): Promise<NvibeChatMessageRow>;
  deleteAllForApp(appId: string): Promise<void>;
}
