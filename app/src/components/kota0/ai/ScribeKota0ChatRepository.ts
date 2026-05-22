import { scribe } from "@/lib/scribe";
import type { ChatRole } from "@/components/kota0/ai/chat.types";
import type {
  Kota0ChatMessageData,
  Kota0ChatMessageKind,
  Kota0ChatMessageRow,
  Kota0ChatRepository,
} from "./kota0ChatTypes";

const TABLE = "k0_chat_message";

type ScribeRow = {
  id: number;
  data: Kota0ChatMessageData;
  date_created?: string;
  date_modified?: string;
};

function extractRowsArray(raw: unknown): ScribeRow[] | null {
  if (Array.isArray(raw)) return raw as ScribeRow[];
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const candidates = [o.data, o.rows, o.items, o.records];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as ScribeRow[];
  }
  const inner = o.data;
  if (inner && typeof inner === "object") {
    const io = inner as Record<string, unknown>;
    for (const c of [io.data, io.rows, io.items]) {
      if (Array.isArray(c)) return c as ScribeRow[];
    }
  }
  return null;
}

function normalizeAllRows(raw: unknown): ScribeRow[] {
  return extractRowsArray(raw) ?? [];
}

function asData(raw: Record<string, unknown> | undefined): Kota0ChatMessageData | null {
  if (!raw || typeof raw !== "object") return null;
  const message_id = typeof raw.message_id === "string" ? raw.message_id : null;
  const app_id = typeof raw.app_id === "string" ? raw.app_id : null;
  const role =
    raw.role === "user" || raw.role === "assistant" || raw.role === "system" ? raw.role : null;
  const content = typeof raw.content === "string" ? raw.content : null;
  const created_at =
    typeof raw.created_at === "string" && raw.created_at.trim() ? raw.created_at.trim()
    : typeof (raw as { createdAt?: unknown }).createdAt === "string" &&
        String((raw as { createdAt: string }).createdAt).trim() ?
      String((raw as { createdAt: string }).createdAt).trim()
    : "";
  if (!message_id || !app_id || !role || content === null) return null;
  let kind: Kota0ChatMessageKind = "message";
  if (raw.kind === "plan" || raw.kind === "fresh_start") {
    kind = raw.kind;
  }
  return { message_id, app_id, role, content, created_at, kind };
}

function rowToMessage(row: ScribeRow): Kota0ChatMessageRow | null {
  const data = asData(row.data as unknown as Record<string, unknown>);
  if (!data) return null;
  const createdAt =
    data.created_at.trim() !== "" ? data.created_at : (row.date_created ?? row.date_modified ?? new Date().toISOString());
  return {
    message_id: data.message_id,
    app_id: data.app_id,
    role: data.role,
    content: data.content,
    createdAt,
    scribeRowId: row.id,
    kind: data.kind ?? "message",
  };
}

export class ScribeKota0ChatRepository implements Kota0ChatRepository {
  async listByAppId(appId: string): Promise<Kota0ChatMessageRow[]> {
    const res = await scribe.get(`/${TABLE}/all`);
    const rows = normalizeAllRows(res.data);
    const out: Kota0ChatMessageRow[] = [];
    for (const row of rows) {
      const m = rowToMessage(row);
      if (m && m.app_id === appId) out.push(m);
    }
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return out;
  }

  async appendMessage(input: {
    appId: string;
    role: ChatRole;
    content: string;
    kind?: Kota0ChatMessageKind;
  }): Promise<Kota0ChatMessageRow> {
    const { randomUUID } = await import("node:crypto");
    const message_id = randomUUID();
    const created_at = new Date().toISOString();
    const kind: Kota0ChatMessageKind = input.kind ?? "message";
    const data: Kota0ChatMessageData = {
      message_id,
      app_id: input.appId,
      role: input.role,
      content: input.content,
      created_at,
      ...(kind !== "message" ? { kind } : {}),
    };
    await scribe.post(`/${TABLE}`, {
      data,
      date_created: created_at,
      date_modified: created_at,
      created_by: 1,
      modified_by: 1,
    });
    /** Scribe may index slightly async — retry before failing. */
    for (let attempt = 0; attempt < 8; attempt++) {
      const list = await this.listByAppId(input.appId);
      const found = list.find((m) => m.message_id === message_id);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
    }
    throw new Error("scribe_chat_append_failed");
  }

  async deleteAllForApp(appId: string): Promise<void> {
    const res = await scribe.get(`/${TABLE}/all`);
    const rows = normalizeAllRows(res.data);
    for (const row of rows) {
      const d = asData(row.data as unknown as Record<string, unknown>);
      if (d?.app_id === appId) {
        await scribe.delete(`/${TABLE}/${row.id}`);
      }
    }
  }

  async deleteMessageById(appId: string, messageId: string): Promise<void> {
    const res = await scribe.get(`/${TABLE}/all`);
    const rows = normalizeAllRows(res.data);
    for (const row of rows) {
      const d = asData(row.data as unknown as Record<string, unknown>);
      if (d?.app_id === appId && d?.message_id === messageId) {
        await scribe.delete(`/${TABLE}/${row.id}`);
        return;
      }
    }
  }
}
