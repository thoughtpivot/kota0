/**
 * Shared Gemini plan turn — used by Plan.backend and Powervibe chat routes.
 * Keep imports server-safe (@/lib/env side effects only where imported).
 */
import "@/lib/env";

import { DEFAULT_GEMINI_MODEL } from "@/lib/geminiModel";
import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import { z } from "zod";
import { PlanTurnSchema, type PlanTurn } from "@shared/planTurn.ts";

export type ChatRole = "user" | "assistant" | "system";

export interface IncomingMessage {
  role: ChatRole;
  content: string;
}

const PLAN_SYSTEM =
  "You are a planning assistant for a vibe-coding tool. Help the user refine a small Vue app idea. " +
  "Ground plans in **workspace production dependencies** (the product injects an allowlist)—do **not** propose npm libraries absent from that list; adding deps requires a workspace change, not something user bundles install from chat. " +
  "**Modern stack:** Vue **`<script setup lang=\"ts\">`** + Composition API; **`fetch`** from the browser to **`/api/powervibe-app/…`** (via bundle helper). **Default LLM in apps:** **`App.backend.ts`** calls workspace **`POST /api/powervibe/apps/:appId/ai/complete`** via **`powervibePlatformAiCompleteText({ prompt: … })`** from **`@shared/powervibePlatformAi`** (**`POWERVIBE_PLATFORM_API_ORIGIN`** + **`POWERVIBE_APP_ID`** in bundle env — workspace **`GEMINI_*`** only; **never** pass the prompt string as the only argument). **Opt-in direct Gemini:** **`GoogleGenAI`** from **`@google/genai`** + **`ai.models.generateContent`** + **`response.text`** + bundle **`GEMINI_API_KEY`** — not **`GoogleGenerativeAI`**/**`getGenerativeModel`**. Avoid **`gemini-1.5-*`** as the assumed default. " +
  "**Charts:** suggest **`vue-chartjs`**/**`chart.js`** only when the idea implies dashboards, KPIs, metrics, trends, or quantitative visualization—not for every vague app. " +
  "When the idea needs authentication (login, OAuth, sessions), keep the plan high-level—PowerVibe has no default auth framework in workspace dependencies; mention tradeoffs and Scribe for user data unless the user names specific tools. " +
  "When the idea needs persisted data or a database, assume **ThoughtPivot Scribe** REST plus **`SCRIBE_URL`** in bundle env—not an embedded SQLite/local ORM stack by default. **Unless** the user explicitly wants **local-only** / **localStorage** / **offline browser** storage, plans must include **real bundle backend routes** (not leaving only a hello stub) plus **`App.vue`** calling **`bundleApiUrl`**. **`App.vue` must never call Scribe directly**—route **`App.vue` → bundle `/api/powervibe-app/…` → `App.backend.ts` → `createScribeRestClient`**. " +
  "When the idea mentions **AI**, **LLM**, **sentiment**, **insights**, **summarize**, or **analyze text**, plan **`powervibePlatformAiCompleteText({ prompt: … })`** on **`App.backend.ts`** by default (**no** bundle **`GEMINI_*`**); if the user wants **their own** keys, plan **`@google/genai`** + **`GEMINI_API_KEY`**—not fake static copy in the UI. For **canvas/generative/abstract** visuals, plan **canvas/SVG**—not generic charts unless charts are clearly part of the ask. " +
  "Bundle **`App.backend.ts`** should prefer **`createScribeRestClient`** from **`@shared/scribeRestClient`** (and **`buildScribeRowEnvelope`** from **`@shared/scribeRowEnvelope`**) so POST/PUT bodies match **`default.table.schema.json`**; the published Scribe README often omits that envelope—ignore flat-body examples for PowerVibe. **`SCRIBE_URL`** in bundle env must be a **real** reachable base (e.g. **`http://127.0.0.1:1337`** locally)—never placeholder hosts like **`example.com`**. " +
  "**Platform AI** (hosted workspace route) is the default for generated LLM calls; **`@google/genai`** + bundle **`GEMINI_*`** when users opt in. **MCP (`@modelcontextprotocol/sdk`)** belongs in **`App.backend.ts`** with secrets in bundle env—not called from untrusted browser code. When discussing bundle **`.env`**, plans should treat **full `KEY=value` visibility** as normal for the builder—no redaction in assistant prose. " +
  "Scribe **POST/PUT** bodies use a fixed row envelope: **`data`** (object with domain fields), **`date_created`** / **`date_modified`** (ISO-8601 strings), **`created_by`** / **`modified_by`** (integers; **`0`** allowed)—no extra top-level keys. " +
  "Be concise. Your reply must satisfy the JSON schema (assistant message, plan bullets, open questions).";

const JSON_HINT =
  "\n\nReply with a single JSON object only (no markdown). Keys: assistantMessage (string), planBullets (string[]), openQuestions (string[]).";

function buildContents(messages: IncomingMessage[]): Content[] {
  const contents: Content[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  return contents;
}

function planTurnJsonSchema(): Record<string, unknown> {
  const raw = z.toJSONSchema(PlanTurnSchema) as Record<string, unknown>;
  delete raw.$schema;
  return raw;
}

function augmentLastUserText(contents: Content[], suffix: string): Content[] {
  const copy: Content[] = contents.map((c) => ({
    role: c.role,
    parts: c.parts?.map((p) => ("text" in p && typeof p.text === "string" ? { text: p.text } : p)),
  }));
  for (let i = copy.length - 1; i >= 0; i--) {
    const c = copy[i];
    if (c.role !== "user" || !c.parts?.length) continue;
    const head = c.parts[0];
    if (head && typeof head === "object" && "text" in head && typeof head.text === "string") {
      copy[i] = {
        role: "user",
        parts: [{ text: head.text + suffix }, ...c.parts.slice(1)],
      };
      return copy;
    }
  }
  return [...copy, { role: "user", parts: [{ text: suffix.trim() }] }];
}

function formatGeminiError(e: unknown, model: string): string {
  if (e instanceof ApiError) {
    const extra =
      e.status === 403 || e.status === 400 ?
        ` | Hint: use an API key from https://aistudio.google.com/apikey , enable "Generative Language API" on the GCP project, check billing/region. If the model returns 404, set GEMINI_MODEL (e.g. gemini-2.5-flash or gemini-2.5-pro). Current: ${model}.`
      : "";
    return `${e.message}${extra}`;
  }
  return e instanceof Error ? e.message : "unknown_error";
}

async function runPlanJsonMimeFallback(
  ai: GoogleGenAI,
  model: string,
  contents: Content[],
): Promise<ReturnType<typeof PlanTurnSchema.parse>> {
  const augmented = augmentLastUserText(contents, JSON_HINT);
  const response = await ai.models.generateContent({
    model,
    contents: augmented,
    config: {
      systemInstruction: PLAN_SYSTEM,
      responseMimeType: "application/json",
    },
  });
  const text = response.text;
  if (!text) {
    throw new Error("Empty model content in JSON fallback");
  }
  const parsed = PlanTurnSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(`JSON did not match plan schema: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function runPlanStructured(
  ai: GoogleGenAI,
  model: string,
  contents: Content[],
): Promise<ReturnType<typeof PlanTurnSchema.parse>> {
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: PLAN_SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: planTurnJsonSchema(),
    },
  });
  const text = response.text;
  if (!text) {
    throw new Error("Empty model content");
  }
  const parsed = PlanTurnSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(`JSON did not match plan schema: ${parsed.error.message}`);
  }
  return parsed.data;
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
    assistantMessage: `Got it — you said: “${snippet}”. Here is a stub plan reply until the Gemini API is reachable.`,
    planBullets: [
      "Clarify the one screen or flow you want first",
      "List inputs, outputs, and who uses it",
      "Pick success criteria (what “done” looks like)",
    ],
    openQuestions: [
      "What is the primary user action on day one?",
      "Any must-have integrations (auth, data, 3D, etc.)?",
    ],
  };
}

export async function runPlan(messages: IncomingMessage[]): Promise<PlanTurn> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const contents = buildContents(messages);
  if (contents.length === 0) {
    throw new Error("No user or assistant messages");
  }

  try {
    return await runPlanStructured(ai, model, contents);
  } catch (e) {
    const retry = e instanceof ApiError && (e.status === 403 || e.status === 400 || e.status === 404);
    if (retry) {
      try {
        return await runPlanJsonMimeFallback(ai, model, contents);
      } catch (inner) {
        throw new Error(
          `${formatGeminiError(e, model)} | JSON fallback: ${inner instanceof Error ? inner.message : String(inner)}`,
        );
      }
    }
    throw new Error(formatGeminiError(e, model));
  }
}
