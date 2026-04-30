import type { ChatMessage } from "@/components/powervibe/ai/chat.types";
import { PlanTurnSchema, type PlanTurn } from "@shared/planTurn.ts";

let warnedPlanApiMisconfig = false;

/** Warn when VITE points at Vite :3001 without /api — POST …/plan hits Vite and returns 404. */
function warnIfPlanUrlHitsViteDevServer(url: string): void {
  if (!import.meta.env.DEV || warnedPlanApiMisconfig) return;
  try {
    const resolved = new URL(url, "http://localhost");
    const hitsVitePort = resolved.port === "3001";
    const hasApiPrefix = resolved.pathname.includes("/api/");
    if (hitsVitePort && !hasApiPrefix) {
      warnedPlanApiMisconfig = true;
      console.warn(
        "[planApi] Plan API URL goes to the Vite dev port without /api (e.g. …:3001/plan). " +
          "Vite has no POST /plan → 404. Leave VITE_PLAN_API_URL unset for /api/plan, " +
          "or use FLIGHT_PORT (http://127.0.0.1:3000), or base …:3001/api. See README.",
      );
    }
  } catch {
    /* ignore invalid URL */
  }
}

function planUrl(): string {
  const raw = (import.meta.env.VITE_PLAN_API_URL as string | undefined)?.trim() ?? "";
  if (!raw) return "/api/plan";
  const base = raw.replace(/\/$/, "");
  // Avoid `.../plan/plan` if someone sets the full path in .env
  const url = base.endsWith("/plan") ? base : `${base}/plan`;
  warnIfPlanUrlHitsViteDevServer(url);
  return url;
}

export type PlanTurnRequestResult =
  | { ok: true; turn: PlanTurn }
  | { ok: false; turn: null; reason: string };

export async function requestPlanTurn(messages: ChatMessage[]): Promise<PlanTurnRequestResult> {
  const payload = {
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  try {
    const res = await fetch(planUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const body = raw as { error?: string; message?: string };
      const detail = body?.message ?? body?.error ?? res.statusText;
      const reason = detail ? `${res.status} — ${detail}` : `${res.status}`;
      return { ok: false, turn: null, reason };
    }
    const parsed = PlanTurnSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, turn: null, reason: "Response did not match the plan schema" };
    }
    return { ok: true, turn: parsed.data };
  } catch (e) {
    const msg = e instanceof TypeError && e.message === "Failed to fetch" ? "Failed to fetch (is the plan API running?)" : "Network error";
    return { ok: false, turn: null, reason: msg };
  }
}
