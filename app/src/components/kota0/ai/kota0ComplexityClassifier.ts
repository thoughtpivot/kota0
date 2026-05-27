/**
 * Lightweight complexity classifier — one fast Gemini Flash call (300ms cap).
 * Defaults to `complex: true` on error so we never drop a real intent.
 */
import "@/lib/env";

import { z } from "zod";
import {
  buildKota0GeminiModel,
  createKota0Agent,
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

/**
 * Pinned Flash model id for the classifier — small, fast, predictable. We
 * intentionally bypass `K0_AI_MODEL` here so a workspace pointed at a heavyweight
 * model (e.g. `gemini-2.5-pro`) doesn't pay pro latency for a yes/no decision.
 * Override via `K0_AI_CLASSIFIER_MODEL` if needed.
 */
const CLASSIFIER_MODEL_ID =
  process.env.K0_AI_CLASSIFIER_MODEL?.trim() || "gemini-2.5-flash";
const CLASSIFIER_TIMEOUT_MS = 300;

export async function classifyKota0Complexity(input: {
  userMessage: string;
  lastAssistantDigest?: string;
}): Promise<Kota0ComplexityResult> {
  const digest =
    input.lastAssistantDigest?.trim().slice(0, 200) ||
    "(no prior assistant turn)";
  const prompt = `User message:\n${input.userMessage.trim()}\n\nLast assistant (one line):\n${digest}`;

  const ClassifierBareSchema = Kota0ComplexitySchema.pick({ complex: true, reason: true });

  const run = async (): Promise<{ complex: boolean; reason: string }> => {
    // Construct the agent with the Flash model directly so we never touch
    // Mastra's model router / `GOOGLE_API_KEY` gateway — same `GEMINI_API_KEY`
    // env contract as the rest of the workspace.
    const agent = createKota0Agent({
      id: "kota0-classifier",
      instructions: CLASSIFIER_SYSTEM,
      model: buildKota0GeminiModel(CLASSIFIER_MODEL_ID) as MastraModelConfig,
    });
    const out = await agent.generate(prompt, {
      structuredOutput: { schema: ClassifierBareSchema },
      modelSettings: { temperature: 0 },
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
        setTimeout(() => reject(new Error("classifier_timeout")), CLASSIFIER_TIMEOUT_MS);
      }),
    ]);
    return { ...result, ms: Date.now() - started };
  } catch {
    return { complex: true, reason: "classifier_error_or_timeout", ms: Date.now() - started };
  }
}
