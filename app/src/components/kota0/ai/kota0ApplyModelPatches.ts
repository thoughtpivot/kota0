import { parse as parseSfc } from "@vue/compiler-sfc";
import {
  applyKota0Patches,
  parseKota0Patch,
  type Kota0PatchApplyFailureReason,
  type Kota0PatchFile,
} from "@/components/kota0/ai/applyKota0Patch";
import { extractTsFenceFromMarkdown } from "@/components/kota0/ai/kota0ExtractBackendFence";
import { extractEnvFenceFromMarkdown } from "@/components/kota0/ai/kota0ExtractEnvFence";
import { extractVueFenceFromMarkdown } from "@/components/kota0/ai/kota0ExtractVueFence";
import type { Kota0Plan, Kota0PlanChangeKind, Kota0PlanFile } from "@/components/kota0/ai/kota0Plan";

export type Kota0ApplyPatchFallback = {
  file: string;
  reason: Kota0PatchApplyFailureReason;
  detail: string;
};

export type Kota0ApplyPatchRejection = {
  file: Kota0PlanFile;
  reason: "full_file_not_allowed" | "no_patch_emitted" | "mixed_patch_and_rewrite";
  detail: string;
};

export type Kota0ApplyPatchHead = {
  source: string;
  backendSource: string;
  bundleEnv: string;
};

export type Kota0ApplyPatchResult = Kota0ApplyPatchHead & {
  fallbacks: Kota0ApplyPatchFallback[];
  rejections: Kota0ApplyPatchRejection[];
};

/**
 * Which files the plan permits a full-file rewrite for. `rewrite` and `add` are
 * the only kinds that can produce a fenced full replacement; `modify` and `remove`
 * must come through as patches against HEAD.
 */
function fullRewriteAllowedFiles(plan: Kota0Plan): Set<Kota0PlanFile> {
  const allow = new Set<Kota0PlanFile>();
  for (const change of plan.changes) {
    if (change.kind === "rewrite" || change.kind === "add") {
      allow.add(change.file);
    }
  }
  return allow;
}

function planKindFor(plan: Kota0Plan, file: Kota0PlanFile): Kota0PlanChangeKind | undefined {
  return plan.changes.find((c) => c.file === file)?.kind;
}

/**
 * Apply model patch text (+ optional fences) against Scribe HEAD without persisting.
 *
 * Behaviour:
 *  - Patches always run first against HEAD.
 *  - Full-file fences (```vue / ```ts / ```env) are honoured ONLY for files the
 *    plan marked `kind: "rewrite"` or `kind: "add"`. For any other plan kind, a
 *    full-file fence is recorded as a rejection and discarded — we never silently
 *    overwrite a `modify` file with the model's full rewrite.
 *  - Mixing a patch and a full-file fence for the same file is also rejected
 *    (ambiguous — the prompt forbids it).
 */
export function applyModelPatchText(
  text: string,
  head: Kota0ApplyPatchHead,
  plan: Kota0Plan,
): Kota0ApplyPatchResult {
  let nextSource = head.source;
  let nextBackend = head.backendSource;
  let nextEnv: string | undefined = head.bundleEnv;
  const fallbacks: Kota0ApplyPatchFallback[] = [];
  const rejections: Kota0ApplyPatchRejection[] = [];

  const patchedFiles = new Set<Kota0PlanFile>();

  const parsed = parseKota0Patch(text);
  if (parsed.ok) {
    const summary = applyKota0Patches(parsed.patches, {
      appVue: head.source,
      appBackend: head.backendSource,
      bundleEnv: head.bundleEnv,
    });
    for (const a of summary.applied) {
      patchedFiles.add(a.file as Kota0PlanFile);
      if (a.file === "App.vue") nextSource = a.nextContent;
      else if (a.file === "App.backend.ts") nextBackend = a.nextContent;
      else if (a.file === ".env") nextEnv = a.nextContent;
    }
    for (const f of summary.fallbacks) {
      patchedFiles.add(f.file as Kota0PlanFile);
      fallbacks.push({ file: f.file, reason: f.reason, detail: f.detail });
    }
  }

  const allowFullRewrite = fullRewriteAllowedFiles(plan);

  const vueFence = extractVueFenceFromMarkdown(text);
  if (vueFence && vueFence.trim().length > 0) {
    const file: Kota0PlanFile = "App.vue";
    if (patchedFiles.has(file)) {
      rejections.push({
        file,
        reason: "mixed_patch_and_rewrite",
        detail: "Model emitted both a patch block and a ```vue full-file fence for App.vue.",
      });
    } else if (!allowFullRewrite.has(file)) {
      rejections.push({
        file,
        reason: "full_file_not_allowed",
        detail: `Plan kind for App.vue is "${planKindFor(plan, file) ?? "(none)"}"; full-file rewrite only allowed for "rewrite" or "add".`,
      });
    } else {
      const { errors } = parseSfc(vueFence, { filename: "App.vue" });
      if (errors.length === 0) nextSource = vueFence;
    }
  }

  const tsFence = extractTsFenceFromMarkdown(text);
  if (tsFence && tsFence.trim().length > 0) {
    const file: Kota0PlanFile = "App.backend.ts";
    if (patchedFiles.has(file)) {
      rejections.push({
        file,
        reason: "mixed_patch_and_rewrite",
        detail: "Model emitted both a patch block and a ```ts full-file fence for App.backend.ts.",
      });
    } else if (!allowFullRewrite.has(file)) {
      rejections.push({
        file,
        reason: "full_file_not_allowed",
        detail: `Plan kind for App.backend.ts is "${planKindFor(plan, file) ?? "(none)"}"; full-file rewrite only allowed for "rewrite" or "add".`,
      });
    } else {
      nextBackend = tsFence.trim();
    }
  }

  const envFence = extractEnvFenceFromMarkdown(text);
  if (envFence && envFence.trim().length > 0) {
    const file: Kota0PlanFile = ".env";
    if (patchedFiles.has(file)) {
      rejections.push({
        file,
        reason: "mixed_patch_and_rewrite",
        detail: "Model emitted both a patch block and a ```env full-file fence for .env.",
      });
    } else if (!allowFullRewrite.has(file)) {
      rejections.push({
        file,
        reason: "full_file_not_allowed",
        detail: `Plan kind for .env is "${planKindFor(plan, file) ?? "(none)"}"; full-file rewrite only allowed for "rewrite" or "add".`,
      });
    } else {
      nextEnv = envFence.trim();
    }
  }

  // Detect "plan says modify, model emitted nothing for that file" — only count it
  // as a rejection if the file truly went untouched (no patch attempt, no fence).
  for (const change of plan.changes) {
    if (change.kind !== "modify" && change.kind !== "remove") continue;
    if (patchedFiles.has(change.file)) continue;
    const fenceProvided =
      (change.file === "App.vue" && vueFence && vueFence.trim().length > 0) ||
      (change.file === "App.backend.ts" && tsFence && tsFence.trim().length > 0) ||
      (change.file === ".env" && envFence && envFence.trim().length > 0);
    if (fenceProvided) continue;
    rejections.push({
      file: change.file,
      reason: "no_patch_emitted",
      detail: `Plan asked to ${change.kind} ${change.file}, but the apply turn produced no patch hunks for it.`,
    });
  }

  return {
    source: nextSource,
    backendSource: nextBackend,
    bundleEnv: nextEnv ?? head.bundleEnv,
    fallbacks,
    rejections,
  };
}

export function buildApplyRetryHint(
  fallbacks: Kota0ApplyPatchFallback[],
  rejections: Kota0ApplyPatchRejection[] = [],
): string {
  const lines: string[] = [];
  if (fallbacks.length > 0) {
    lines.push("Some patches failed to apply against Scribe HEAD:");
    for (const f of fallbacks) {
      lines.push(`- ${f.file}: ${f.reason} — ${f.detail}`);
    }
  }
  if (rejections.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Some output was rejected by the apply parser:");
    for (const r of rejections) {
      lines.push(`- ${r.file}: ${r.reason} — ${r.detail}`);
    }
  }
  lines.push("");
  lines.push("Re-emit patches ONLY for the failed/rejected files.");
  lines.push("Copy context lines character-for-character from HEAD (including indentation).");
  lines.push("Do NOT emit a full-file fence for any file the plan marked as `modify` or `remove`.");
  return lines.join("\n");
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
  const pass1FailedFiles = new Set<Kota0PatchFile>([
    ...pass1.fallbacks.map((f) => f.file as Kota0PatchFile),
    ...pass1.rejections.map((r) => r.file as Kota0PatchFile),
  ]);
  let source = pass1.source;
  let backendSource = pass1.backendSource;
  let bundleEnv = pass1.bundleEnv;
  const fallbacks: Kota0ApplyPatchFallback[] = [];
  const rejections: Kota0ApplyPatchRejection[] = [];

  for (const file of pass1FailedFiles) {
    if (fileChanged(file, head, pass2)) {
      if (file === "App.vue") source = pass2.source;
      else if (file === "App.backend.ts") backendSource = pass2.backendSource;
      else if (file === ".env") bundleEnv = pass2.bundleEnv;
      // Carry over any new pass-2 issues for this same file.
      for (const f of pass2.fallbacks) if (f.file === file) fallbacks.push(f);
      for (const r of pass2.rejections) if (r.file === file) rejections.push(r);
    } else {
      const origFallback = pass1.fallbacks.find((f) => f.file === file);
      if (origFallback) fallbacks.push(origFallback);
      const origRejection = pass1.rejections.find((r) => r.file === file);
      if (origRejection) rejections.push(origRejection);
    }
  }

  return { source, backendSource, bundleEnv, fallbacks, rejections };
}
