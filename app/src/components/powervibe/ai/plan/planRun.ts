/**
 * Shared Gemini plan turn — used by Plan.backend and Nvibe chat routes.
 * Keep imports server-safe (@/lib/env side effects only where imported).
 */
import "@/lib/env";

import { DEFAULT_GEMINI_MODEL } from "@/lib/geminiModel";
import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { PlanTurnSchema, type PlanTurn } from "@shared/planTurn.ts";

export type ChatRole = "user" | "assistant" | "system";

export interface IncomingMessage {
  role: ChatRole;
  content: string;
}

const PLAN_SYSTEM =
  "You are a planning assistant for a vibe-coding tool. Help the user refine a small Vue app idea. " +
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
  const raw = zodToJsonSchema(PlanTurnSchema, {
    name: "PlanTurn",
    $refStrategy: "none",
  }) as Record<string, unknown>;
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
