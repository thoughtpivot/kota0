/**
 * Shared plan turn — used by Plan.backend and Kota0 chat routes.
 * Keep imports server-safe (@/lib/env side effects only where imported).
 */
import "@/lib/env";

import { APICallError, type ModelMessage } from "ai";
import { PlanTurnSchema, type PlanTurn } from "@shared/planTurn.ts";
import {
  kota0AiGenerateObject,
  kota0AiModelDescription,
} from "@/components/kota0/ai/kota0AiProvider";

export type ChatRole = "user" | "assistant" | "system";

export interface IncomingMessage {
  role: ChatRole;
  content: string;
}

const PLAN_SYSTEM =
  "You are a planning assistant for a vibe-coding tool. Help the user refine a small Vue app idea. " +
  "Ground plans in **workspace production dependencies** (the product injects an allowlist)—do **not** propose npm libraries absent from that list; adding deps requires a workspace change, not something user bundles install from chat. " +
  "**Modern stack:** Vue **`<script setup lang=\"ts\">`** + Composition API; **`fetch`** from the browser to **`/api/kota0-app/…`** (via bundle helper). **Default LLM in apps:** **`App.backend.ts`** calls workspace **`POST /api/kota0/apps/:appId/ai/complete`** via **`kota0PlatformAiCompleteText({ prompt: … })`** from **`@shared/kota0PlatformAi`** (**`K0_PLATFORM_API_ORIGIN`** + **`K0_APP_ID`** in bundle env — workspace **`GEMINI_*`** only; **never** pass the prompt string as the only argument). **Opt-in direct Gemini:** **`GoogleGenAI`** from **`@google/genai`** + **`ai.models.generateContent`** + **`response.text`** + bundle **`GEMINI_API_KEY`** — not **`GoogleGenerativeAI`**/**`getGenerativeModel`**. Avoid **`gemini-1.5-*`** as the assumed default. " +
  "**Charts:** suggest **`vue-chartjs`**/**`chart.js`** only when the idea implies dashboards, KPIs, metrics, trends, or quantitative visualization—not for every vague app. " +
  "When the idea needs authentication (login, OAuth, sessions), keep the plan high-level—Kota0 has no default auth framework in workspace dependencies; mention tradeoffs and Scribe for user data unless the user names specific tools. " +
  "When the idea needs persisted data or a database, assume **ThoughtPivot Scribe** REST plus **`SCRIBE_URL`** in bundle env—not an embedded SQLite/local ORM stack by default. **Unless** the user explicitly wants **local-only** / **localStorage** / **offline browser** storage, plans must include **real bundle backend routes** (not leaving only a hello stub) plus **`App.vue`** calling **`bundleApiUrl`**. **`App.vue` must never call Scribe directly**—route **`App.vue` → bundle `/api/kota0-app/…` → `App.backend.ts` → `createScribeRestClient`**. " +
  "When the idea mentions **AI**, **LLM**, **sentiment**, **insights**, **summarize**, or **analyze text**, plan **`kota0PlatformAiCompleteText({ prompt: … })`** on **`App.backend.ts`** by default (**no** bundle **`GEMINI_*`**); if the user wants **their own** keys, plan **`@google/genai`** + **`GEMINI_API_KEY`**—not fake static copy in the UI. For **canvas/generative/abstract** visuals, plan **canvas/SVG**—not generic charts unless charts are clearly part of the ask. " +
  "Bundle **`App.backend.ts`** should prefer **`createScribeRestClient`** from **`@shared/scribeRestClient`** (and **`buildScribeRowEnvelope`** from **`@shared/scribeRowEnvelope`**) so POST/PUT bodies match **`default.table.schema.json`**; the published Scribe README often omits that envelope—ignore flat-body examples for Kota0. **`SCRIBE_URL`** in bundle env must be a **real** reachable base (e.g. **`http://127.0.0.1:1337`** locally)—never placeholder hosts like **`example.com`**. " +
  "**Platform AI** (hosted workspace route) is the default for generated LLM calls; **`@google/genai`** + bundle **`GEMINI_*`** when users opt in. **MCP (`@modelcontextprotocol/sdk`)** belongs in **`App.backend.ts`** with secrets in bundle env—not called from untrusted browser code. When discussing bundle **`.env`**, plans should treat **full `KEY=value` visibility** as normal for the builder—no redaction in assistant prose. " +
  "Scribe **POST/PUT** bodies use a fixed row envelope: **`data`** (object with domain fields), **`date_created`** / **`date_modified`** (ISO-8601 strings), **`created_by`** / **`modified_by`** (integers; **`0`** allowed)—no extra top-level keys. " +
  "Be concise. Your reply must satisfy the JSON schema (assistant message, plan bullets, open questions).";

function buildContents(messages: IncomingMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function formatAiError(e: unknown): string {
  const desc = kota0AiModelDescription();
  if (APICallError.isInstance(e)) {
    const status = e.statusCode;
    const extra =
      status === 403 || status === 400 ?
        ` | Hint: use an API key from https://aistudio.google.com/apikey , enable "Generative Language API" on the GCP project, check billing/region. If the model returns 404, set K0_AI_MODEL / GEMINI_MODEL (e.g. gemini-2.5-flash or gemini-2.5-pro). Current: ${desc.modelId}.`
      : "";
    return `${e.message}${extra}`;
  }
  return e instanceof Error ? e.message : "unknown_error";
}

/** Format a plan turn as markdown for chat display (matches client usePlanChat). */
export function formatPlanTurnToMarkdown(turn: PlanTurn): string {
  const bullets = turn.planBullets.map((b) => `- ${b}`).join("\n");
  const qs = turn.openQuestions.map((q) => `- ${q}`).join("\n");
  return `${turn.assistantMessage}\n\n**Plan**\n\n${bullets}\n\n**Open questions**\n\n${qs}`;
}

export function stubPlanTurn(userText: string): PlanTurn {
  const snippet = userText.trim().slice(0, 120) || "(empty message)";
  return {
    assistantMessage: `Got it — you said: "${snippet}". Here is a stub plan reply until the Gemini API is reachable.`,
    planBullets: [
      "Clarify the one screen or flow you want first",
      "List inputs, outputs, and who uses it",
      "Pick success criteria (what \"done\" looks like)",
    ],
    openQuestions: [
      "What is the primary user action on day one?",
      "Any must-have integrations (auth, data, 3D, etc.)?",
    ],
  };
}

export async function runPlan(messages: IncomingMessage[]): Promise<PlanTurn> {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const contents = buildContents(messages);
  if (contents.length === 0) {
    throw new Error("No user or assistant messages");
  }
  try {
    const result = await kota0AiGenerateObject({
      system: PLAN_SYSTEM,
      messages: contents,
      schema: PlanTurnSchema,
    });
    return result.object as PlanTurn;
  } catch (e) {
    throw new Error(formatAiError(e));
  }
}
