import type { ChatRole } from "@/types/chat";

/** Row payload in Scribe table `kota0_chat_message`. */
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
}
