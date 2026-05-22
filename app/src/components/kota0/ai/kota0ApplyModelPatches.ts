import { parse as parseSfc } from "@vue/compiler-sfc";
import {
  applyKota0Patches,
  parseKota0Patch,
  type Kota0PatchApplyFailureReason,
  type Kota0PatchFile,
} from "@/components/kota0/ai/applyKota0Patch";
import { extractTsFenceFromMarkdown } from "@shared/kota0ExtractBackendFence.ts";
import { extractEnvFenceFromMarkdown } from "@shared/kota0ExtractEnvFence.ts";
import { extractVueFenceFromMarkdown } from "@shared/kota0ExtractVueFence.ts";

export type Kota0ApplyPatchFallback = {
  file: string;
  reason: Kota0PatchApplyFailureReason;
  detail: string;
};

export type Kota0ApplyPatchHead = {
  source: string;
  backendSource: string;
  bundleEnv: string;
};

export type Kota0ApplyPatchResult = Kota0ApplyPatchHead & {
  fallbacks: Kota0ApplyPatchFallback[];
};

/** Apply model patch text (+ optional fences) against Scribe HEAD without persisting. */
export function applyModelPatchText(text: string, head: Kota0ApplyPatchHead): Kota0ApplyPatchResult {
  let nextSource = head.source;
  let nextBackend = head.backendSource;
  let nextEnv: string | undefined = head.bundleEnv;
  const fallbacks: Kota0ApplyPatchFallback[] = [];

  const parsed = parseKota0Patch(text);
  if (parsed.ok) {
    const summary = applyKota0Patches(parsed.patches, {
      appVue: head.source,
      appBackend: head.backendSource,
      bundleEnv: head.bundleEnv,
    });
    for (const a of summary.applied) {
      if (a.file === "App.vue") nextSource = a.nextContent;
      else if (a.file === "App.backend.ts") nextBackend = a.nextContent;
      else if (a.file === ".env") nextEnv = a.nextContent;
    }
    for (const f of summary.fallbacks) {
      fallbacks.push({ file: f.file, reason: f.reason, detail: f.detail });
    }
  }

  const vueFence = extractVueFenceFromMarkdown(text);
  const tsFence = extractTsFenceFromMarkdown(text);
  const envFence = extractEnvFenceFromMarkdown(text);
  if (vueFence && vueFence.trim().length > 0) {
    const { errors } = parseSfc(vueFence, { filename: "App.vue" });
    if (errors.length === 0) nextSource = vueFence;
  }
  if (tsFence && tsFence.trim().length > 0) nextBackend = tsFence.trim();
  if (envFence && envFence.trim().length > 0) nextEnv = envFence.trim();

  return {
    source: nextSource,
    backendSource: nextBackend,
    bundleEnv: nextEnv ?? head.bundleEnv,
    fallbacks,
  };
}

export function buildApplyRetryHint(fallbacks: Kota0ApplyPatchFallback[]): string {
  const lines = fallbacks.map((f) => `- ${f.file}: ${f.reason} — ${f.detail}`);
  return [
    "Some patches failed to apply against Scribe HEAD.",
    "Re-emit patches ONLY for the failed files below.",
    "Copy context lines character-for-character from HEAD (including indentation).",
    ...lines,
  ].join("\n");
}

function fileChanged(file: Kota0PatchFile, head: Kota0ApplyPatchHead, result: Kota0ApplyPatchResult): boolean {
  if (file === "App.vue") return result.source !== head.source;
  if (file === "App.backend.ts") return result.backendSource !== head.backendSource;
  return (result.bundleEnv ?? "") !== head.bundleEnv;
}

/** Merge pass-2 fixes for files that failed in pass-1; keep pass-1 successes. */
export function mergeApplyPatchRetry(
  head: Kota0ApplyPatchHead,
  pass1: Kota0ApplyPatchResult,
  pass2: Kota0ApplyPatchResult,
): Kota0ApplyPatchResult {
  const failedFiles = new Set(pass1.fallbacks.map((f) => f.file as Kota0PatchFile));
  let source = pass1.source;
  let backendSource = pass1.backendSource;
  let bundleEnv = pass1.bundleEnv;
  const fallbacks: Kota0ApplyPatchFallback[] = [];

  for (const file of failedFiles) {
    if (fileChanged(file, head, pass2)) {
      if (file === "App.vue") source = pass2.source;
      else if (file === "App.backend.ts") backendSource = pass2.backendSource;
      else if (file === ".env") bundleEnv = pass2.bundleEnv;
    } else {
      const orig = pass1.fallbacks.find((f) => f.file === file);
      if (orig) fallbacks.push(orig);
    }
  }

  return { source, backendSource, bundleEnv, fallbacks };
}
