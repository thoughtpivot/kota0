/**
 * Lightweight complexity classifier — one fast Gemini Flash call.
 * Defaults to `complex: true` on error so we never drop a real intent.
 */
import "@/lib/env";

import { z } from "zod";
import {
  buildKota0GeminiModel,
  kota0AiGenerateObject,
} from "@/components/kota0/ai/kota0AiProvider";
import type { MastraModelConfig } from "@mastra/core/llm";

export const Kota0ComplexitySchema = z.object({
  complex: z.boolean(),
  reason: z.string(),
});

export type Kota0ComplexityResult = z.infer<typeof Kota0ComplexitySchema> & {
  /** Wall-clock cost of the classifier call (ms). Surfaced to per-turn telemetry. */
  ms: number;
};

const CLASSIFIER_SYSTEM =
  "You classify user prompts for a vibe-coding IDE. " +
  "Return JSON only: { complex: boolean, reason: string }. " +
  "complex=true for: initial app specs, multi-file features, refactors, new routes, auth/data layers, large rewrites. " +
  "complex=false for: typos, rename label, one-line CSS, questions, tiny single-hunk tweaks. " +
  "When unsure, complex=true.";

/** Default timeout — Mastra structured-output Flash calls land ~700–1500ms; 300ms always false-positived. */
export const KOTA0_CLASSIFIER_TIMEOUT_MS_DEFAULT = 4000;

/**
 * Pinned Flash-lite model for the classifier — small, fast, predictable. We
 * intentionally bypass `K0_AI_MODEL` here so a workspace pointed at a heavyweight
 * model (e.g. `gemini-2.5-pro`) doesn't pay pro latency for a yes/no decision.
 * Override via `K0_AI_CLASSIFIER_MODEL` if needed.
 */
export const KOTA0_CLASSIFIER_MODEL_DEFAULT = "gemini-2.5-flash-lite";

export function resolveKota0ClassifierModelId(): string {
  return process.env.K0_AI_CLASSIFIER_MODEL?.trim() || KOTA0_CLASSIFIER_MODEL_DEFAULT;
}

export function resolveKota0ClassifierTimeoutMs(): number {
  const raw = process.env.K0_AI_CLASSIFIER_TIMEOUT_MS?.trim();
  if (!raw) return KOTA0_CLASSIFIER_TIMEOUT_MS_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 500) return KOTA0_CLASSIFIER_TIMEOUT_MS_DEFAULT;
  return Math.min(Math.floor(n), 15_000);
}

export async function classifyKota0Complexity(input: {
  userMessage: string;
  lastAssistantDigest?: string;
}): Promise<Kota0ComplexityResult> {
  const digest =
    input.lastAssistantDigest?.trim().slice(0, 200) ||
    "(no prior assistant turn)";
  const prompt = `User message:\n${input.userMessage.trim()}\n\nLast assistant (one line):\n${digest}`;

  const ClassifierBareSchema = Kota0ComplexitySchema.pick({ complex: true, reason: true });
  const timeoutMs = resolveKota0ClassifierTimeoutMs();
  const modelId = resolveKota0ClassifierModelId();

  const run = async (): Promise<{ complex: boolean; reason: string }> => {
    const out = await kota0AiGenerateObject<{ complex: boolean; reason: string }>({
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      schema: ClassifierBareSchema,
      model: buildKota0GeminiModel(modelId) as MastraModelConfig,
    });
    const parsed = ClassifierBareSchema.safeParse(out.object);
    if (parsed.success) return parsed.data;
    return { complex: true, reason: "classifier_parse_failed" };
  };

  const started = Date.now();
  try {
    const result = await Promise.race([
      run(),
      new Promise<{ complex: boolean; reason: string }>((_, reject) => {
        setTimeout(() => reject(new Error("classifier_timeout")), timeoutMs);
      }),
    ]);
    return { ...result, ms: Date.now() - started };
  } catch (e) {
    const reason =
      e instanceof Error && e.message === "classifier_timeout"
        ? "classifier_timeout"
        : "classifier_error";
    return { complex: true, reason, ms: Date.now() - started };
  }
}
