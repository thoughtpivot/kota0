/**
 * Provider abstraction over the Vercel AI SDK. Every Gemini call site in kota0
 * should import from this module instead of `@google/genai` or `@ai-sdk/google`
 * directly — that way swapping providers (Anthropic, OpenAI) is an env-config
 * change in one place rather than a multi-file refactor.
 *
 * Env knobs:
 *   K0_AI_PROVIDER   — "google" (default; only supported in this PR)
 *   K0_AI_MODEL      — e.g. "gemini-3-flash-preview"
 *   GEMINI_MODEL     — fallback for K0_AI_MODEL (compat with existing .env files)
 *   GEMINI_API_KEY   — Google AI Studio key for the Google provider
 *
 * The thin wrappers (`kota0AiStream`, `kota0AiGenerate`, `kota0AiGenerateObject`)
 * pass through to the AI SDK so call sites get full feature access (tools,
 * stopWhen, providerOptions, …) without re-exporting the entire API surface.
 */
import "@/lib/env";

import {
  generateObject,
  generateText,
  streamText,
  type LanguageModel,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { DEFAULT_GEMINI_MODEL } from "@/lib/geminiModel";

export type Kota0AiProviderName = "google";

export function resolveKota0AiProvider(): Kota0AiProviderName {
  const raw = process.env.K0_AI_PROVIDER?.trim().toLowerCase();
  if (!raw || raw === "google") return "google";
  // Future: anthropic / openai go here. For now we stay on Google so the
  // refactor is a pure rewire — provider expansion is a follow-up PR.
  throw new Error(`K0_AI_PROVIDER="${raw}" is not supported yet. Use "google".`);
}

export function resolveKota0AiModelId(): string {
  return (
    process.env.K0_AI_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    DEFAULT_GEMINI_MODEL
  );
}

/**
 * Test-only injection. The eval harness sets a `MockLanguageModelV2` here so the
 * agent loop can run offline against scripted responses; the provider then
 * returns this model from `kota0AiModel()` instead of building a real Google
 * client. Production code never touches this — `setKota0AiModelForTest(null)`
 * resets to default behavior.
 */
let _testModelOverride: LanguageModel | null = null;

export function setKota0AiModelForTest(model: LanguageModel | null): void {
  _testModelOverride = model;
}

/**
 * Resolve the AI SDK `LanguageModel` for the configured provider + model id.
 * Throws if the provider's API key is missing — callers should catch and
 * surface a clean "AI is not configured" error to the user.
 */
export function kota0AiModel(): LanguageModel {
  if (_testModelOverride !== null) return _testModelOverride;
  const provider = resolveKota0AiProvider();
  const modelId = resolveKota0AiModelId();
  if (provider === "google") {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    const google = createGoogleGenerativeAI({ apiKey });
    return google(modelId);
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

/** Diagnostic helper — describes the resolved provider+model without instantiating. */
export function kota0AiModelDescription(): { provider: Kota0AiProviderName; modelId: string } {
  return { provider: resolveKota0AiProvider(), modelId: resolveKota0AiModelId() };
}

/**
 * Thin wrappers. Each accepts an `options` object compatible with the
 * corresponding AI SDK function; the model is injected here so call sites stay
 * provider-agnostic. Pass any AI SDK option through (`tools`, `stopWhen`,
 * `providerOptions`, …) — we don't shrink the surface.
 *
 * The Omit + spread combo confuses TS's narrowing of the Prompt discriminator
 * union (prompt-OR-messages), so the wrappers force the model into the call
 * site via `as` rather than relying on inferred merging.
 */
export type Kota0AiGenerateTextOptions = Omit<Parameters<typeof generateText>[0], "model">;
export type Kota0AiStreamTextOptions = Omit<Parameters<typeof streamText>[0], "model">;

export function kota0AiGenerate(options: Kota0AiGenerateTextOptions): ReturnType<typeof generateText> {
  const args = { model: kota0AiModel(), ...options } as Parameters<typeof generateText>[0];
  return generateText(args);
}

export function kota0AiStream(options: Kota0AiStreamTextOptions): ReturnType<typeof streamText> {
  const args = { model: kota0AiModel(), ...options } as Parameters<typeof streamText>[0];
  return streamText(args);
}

/**
 * `generateObject` is heavily overloaded (object | array | enum | no-schema)
 * so we type the wrapper as a generic passthrough. Use it like:
 *   kota0AiGenerateObject({ system, messages, schema: Kota0PlanSchema })
 * The caller is responsible for casting `.object` to the schema's inferred type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Kota0AiGenerateObjectOptions = Omit<Parameters<typeof generateObject<any>>[0], "model">;

export function kota0AiGenerateObject(
  options: Kota0AiGenerateObjectOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ReturnType<typeof generateObject<any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args = { model: kota0AiModel(), ...options } as Parameters<typeof generateObject<any>>[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return generateObject(args) as ReturnType<typeof generateObject<any>>;
}
