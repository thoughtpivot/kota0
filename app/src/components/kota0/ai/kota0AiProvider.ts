/**
 * Mastra-backed AI provider for Kota0 workspace turns.
 *
 * Env knobs (unchanged from the Vercel AI SDK era — same `.env` works):
 *   K0_AI_PROVIDER   — "google" (default)
 *   K0_AI_MODEL      — e.g. "gemini-3-flash-preview"
 *   GEMINI_MODEL     — fallback for K0_AI_MODEL
 *   GEMINI_API_KEY   — Google AI Studio key
 *
 * **We do NOT use Mastra's model-router string format** (`google/<id>`). That
 * router's gateway looks for `process.env.GOOGLE_API_KEY` and ignores
 * `GEMINI_API_KEY`, which would force every operator to rename their key.
 * Instead we construct a Vercel `LanguageModel` via `@ai-sdk/google` with the
 * `GEMINI_API_KEY` we already have and hand the model **instance** to Mastra.
 * Mastra Agents accept either form (string for the router, or a LanguageModel
 * for direct provider use).
 */
import "@/lib/env";

import {
  APICallError,
  hasToolCall,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { Agent } from "@mastra/core/agent";
import type { AgentExecutionOptionsBase, ToolsInput } from "@mastra/core/agent";
import type { MessageListInput } from "@mastra/core/agent/message-list";
import type { ChunkType } from "@mastra/core/stream";
import { Mastra } from "@mastra/core";
import type { MastraModelConfig } from "@mastra/core/llm";
import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
} from "@ai-sdk/google";
import { DEFAULT_GEMINI_MODEL } from "@/lib/geminiModel";

export type Kota0AiProviderName = "google";

export function resolveKota0AiProvider(): Kota0AiProviderName {
  const raw = process.env.K0_AI_PROVIDER?.trim().toLowerCase();
  if (!raw || raw === "google") return "google";
  throw new Error(`K0_AI_PROVIDER="${raw}" is not supported yet. Use "google".`);
}

export function resolveKota0AiModelId(): string {
  return (
    process.env.K0_AI_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    DEFAULT_GEMINI_MODEL
  );
}

let _testModelOverride: LanguageModel | null = null;

export function setKota0AiModelForTest(model: LanguageModel | null): void {
  _testModelOverride = model;
}

/**
 * Cached `@ai-sdk/google` provider keyed by API key so we don't rebuild the
 * underlying HTTP client on every call. Key rotation (rare) busts the cache.
 */
let _cachedGoogleProvider: { apiKey: string; provider: GoogleGenerativeAIProvider } | null = null;

function googleProvider(apiKey: string): GoogleGenerativeAIProvider {
  if (_cachedGoogleProvider && _cachedGoogleProvider.apiKey === apiKey) {
    return _cachedGoogleProvider.provider;
  }
  const provider = createGoogleGenerativeAI({ apiKey });
  _cachedGoogleProvider = { apiKey, provider };
  return provider;
}

/**
 * Build a Gemini `LanguageModel` for the given model id using our existing
 * `GEMINI_API_KEY`. Call sites (provider + classifier) feed the resulting
 * instance to Mastra so the model-router/gateway path is never taken.
 */
export function buildKota0GeminiModel(modelId: string): LanguageModel {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return googleProvider(apiKey)(modelId);
}

function resolveModelConfig(): MastraModelConfig {
  if (_testModelOverride !== null) return _testModelOverride as MastraModelConfig;
  const provider = resolveKota0AiProvider();
  if (provider === "google") {
    return buildKota0GeminiModel(resolveKota0AiModelId()) as MastraModelConfig;
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

export function kota0AiModelDescription(): { provider: Kota0AiProviderName; modelId: string } {
  return { provider: resolveKota0AiProvider(), modelId: resolveKota0AiModelId() };
}

/** In-memory per-turn telemetry for A/B stats (`npm run k0:ai-stats`). */
export type Kota0AiTurnStats = {
  at: string;
  classifierComplex?: boolean;
  classifierMs?: number;
  planTokensIn?: number;
  planTokensOut?: number;
  applyStepCount?: number;
  applyTokensIn?: number;
  applyTokensOut?: number;
  totalMs?: number;
  modelId: string;
};

const _turnStats: Kota0AiTurnStats[] = [];
const K0_AI_STATS_MAX = 500;

export function recordKota0AiTurnStats(stats: Omit<Kota0AiTurnStats, "at" | "modelId">): void {
  _turnStats.push({
    at: new Date().toISOString(),
    modelId: resolveKota0AiModelId(),
    ...stats,
  });
  if (_turnStats.length > K0_AI_STATS_MAX) {
    _turnStats.splice(0, _turnStats.length - K0_AI_STATS_MAX);
  }
}

export function getKota0AiTurnStats(limit = 50): Kota0AiTurnStats[] {
  return _turnStats.slice(-limit);
}

/** Test/admin helper — reset the in-memory window. */
export function resetKota0AiTurnStatsForTest(): void {
  _turnStats.length = 0;
}

export function kota0Mastra(): Mastra {
  return _mastraSingleton;
}

const _mastraSingleton = new Mastra({});

export function createKota0Agent(opts: {
  id: string;
  name?: string;
  instructions?: string;
  tools?: ToolsInput;
  model?: MastraModelConfig;
}): Agent {
  return new Agent({
    id: opts.id,
    name: opts.name ?? opts.id,
    instructions: opts.instructions ?? "You are the Kota0 workspace coding assistant.",
    model: opts.model ?? resolveModelConfig(),
    tools: opts.tools,
  });
}

export type Kota0AiGenerateTextOptions = {
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  model?: MastraModelConfig;
};

export async function kota0AiGenerate(
  options: Kota0AiGenerateTextOptions,
): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const agent = createKota0Agent({
    id: "kota0-generate",
    instructions: options.system,
    model: options.model,
  });
  const messages: MessageListInput =
    options.messages !== undefined
      ? (options.messages as MessageListInput)
      : (options.prompt ?? "");
  const out = await agent.generate(messages, {
    system: options.system,
    ...(options.maxOutputTokens !== undefined || options.temperature !== undefined
      ? {
          modelSettings: {
            ...(options.maxOutputTokens !== undefined ? { maxOutputTokens: options.maxOutputTokens } : {}),
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          },
        }
      : {}),
  });
  return {
    text: out.text ?? "",
    usage: out.usage
      ? {
          inputTokens: out.usage.inputTokens,
          outputTokens: out.usage.outputTokens,
        }
      : undefined,
  };
}

export type Kota0AiStreamTextOptions = {
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  tools?: ToolsInput;
  stopWhen?: AgentExecutionOptionsBase<unknown>["stopWhen"];
  maxSteps?: number;
  onChunk?: (chunk: ChunkType<unknown>) => void;
  model?: MastraModelConfig;
};

export async function kota0AiStream(options: Kota0AiStreamTextOptions) {
  const agent = createKota0Agent({
    id: "kota0-stream",
    instructions: options.system,
    tools: options.tools,
    model: options.model,
  });
  const messages: MessageListInput =
    options.messages !== undefined
      ? (options.messages as MessageListInput)
      : (options.prompt ?? "");
  const output = await agent.stream(messages, {
    system: options.system,
    stopWhen: options.stopWhen,
    maxSteps: options.maxSteps,
    onChunk: options.onChunk,
  } as AgentExecutionOptionsBase<unknown>);
  for await (const _chunk of output.fullStream) {
    /* drain — onChunk handles live events */
  }
  const full = await output.getFullOutput();
  return {
    text: full.text,
    steps: full.steps,
    usage: full.usage,
  };
}

export type Kota0AiGenerateObjectOptions = {
  system?: string;
  messages?: ModelMessage[];
  schema: import("zod").ZodType;
  model?: MastraModelConfig;
};

export async function kota0AiGenerateObject<T>(options: Kota0AiGenerateObjectOptions): Promise<{ object: T }> {
  const agent = createKota0Agent({
    id: "kota0-structured",
    instructions: options.system,
    model: options.model,
  });
  const messages: MessageListInput =
    options.messages !== undefined ? (options.messages as MessageListInput) : "";
  const out = await agent.generate(messages, {
    system: options.system,
    structuredOutput: { schema: options.schema },
  });
  return { object: out.object as T };
}

export { APICallError, hasToolCall, stepCountIs };
