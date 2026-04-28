/**
 * Build Gemini `contents` from persisted Scribe chat rows.
 * - Includes **system** lines as synthetic user context so the model sees Code-tab applies etc.
 * - Merges consecutive **user** parts (valid for Gemini alternation).
 * - Ensures the sequence starts with **user** (Gemini expects user first).
 * - Takes only the **tail** of the thread so very long histories stay within limits (full thread remains in Scribe).
 */
import type { IncomingMessage } from "@/components/nvibe/ai/plan/planRun";
import type { NvibeChatMessageRow } from "@/components/nvibe/ai/nvibeChatTypes";

const DEFAULT_MAX_MESSAGES = 100;

const OMIT_VUE_FENCE_PLACEHOLDER =
  "[omitted previous proposed App.vue; use Scribe HEAD in system prompt — not the live file]";

function resolveOmitHistoricalVueFences(): boolean {
  const raw = process.env.NVIBE_CHAT_OMIT_HISTORICAL_VUE_FENCES?.trim().toLowerCase();
  if (!raw) return true;
  return raw !== "0" && raw !== "false" && raw !== "no" && raw !== "off";
}

/** Replace ```vue … ``` in older assistant turns so Gemini relies on Scribe HEAD (model input only). */
function stripHistoricalVueFencesInTail(rows: NvibeChatMessageRow[]): NvibeChatMessageRow[] {
  if (!resolveOmitHistoricalVueFences()) return rows;
  let lastAssistant = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]!.role === "assistant") {
      lastAssistant = i;
      break;
    }
  }
  if (lastAssistant < 0) return rows;
  return rows.map((r, i) => {
    if (r.role !== "assistant" || i === lastAssistant) return r;
    const content = r.content.replace(/```vue\s*[\s\S]*?```/gi, OMIT_VUE_FENCE_PLACEHOLDER);
    return content === r.content ? r : { ...r, content };
  });
}

export function resolveNvibeChatGeminiTailCount(): number {
  const raw = process.env.NVIBE_CHAT_GEMINI_MAX_MESSAGES?.trim();
  if (!raw) return DEFAULT_MAX_MESSAGES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 4) return DEFAULT_MAX_MESSAGES;
  return Math.min(Math.floor(n), 500);
}

function toIncomingRows(rows: NvibeChatMessageRow[]): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  for (const r of rows) {
    if (r.role === "system") {
      out.push({ role: "user", content: `[System]\n${r.content}` });
    } else if (r.role === "user" || r.role === "assistant") {
      out.push({ role: r.role, content: r.content });
    }
  }
  return out;
}

function mergeConsecutiveUsers(messages: IncomingMessage[]): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (m.role === "user" && last?.role === "user") {
      last.content = `${last.content}\n\n---\n\n${m.content}`;
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

/** Map Scribe rows → Gemini-ready alternating user/model history (tail-limited). */
export function nvibeChatRowsToGeminiIncoming(rows: NvibeChatMessageRow[]): IncomingMessage[] {
  const max = resolveNvibeChatGeminiTailCount();
  const tail = rows.length > max ? rows.slice(-max) : rows;
  const slice = stripHistoricalVueFencesInTail(tail);
  const mapped = toIncomingRows(slice);
  const merged = mergeConsecutiveUsers(mapped);
  if (merged.length === 0) return merged;
  if (merged[0]!.role === "assistant") {
    merged.unshift({
      role: "user",
      content:
        "(Continuing an nVibe chat thread. The next assistant message is prior context from Scribe — respond to the latest user message.)",
    });
  }
  return merged;
}
