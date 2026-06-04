import { parse as parseSfc } from "@vue/compiler-sfc";
import {
  applyPatches,
  parsePatch,
  type PatchApplyFailureReason,
  type PatchFile,
} from "@/components/kota0/ai/patch/applyPatch";
import { extractTsFenceFromMarkdown } from "@/components/kota0/ai/patch/extractBackendFence";
import { extractEnvFenceFromMarkdown } from "@/components/kota0/ai/patch/extractEnvFence";
import { extractVueFenceFromMarkdown } from "@/components/kota0/ai/patch/extractVueFence";
import type { Plan, PlanChangeKind, PlanFile } from "@/components/kota0/ai/plan/plan";

export type ApplyPatchFallback = {
  file: string;
  reason: PatchApplyFailureReason;
  detail: string;
};

export type ApplyPatchRejection = {
  file: PlanFile;
  reason: "full_file_not_allowed" | "no_patch_emitted" | "mixed_patch_and_rewrite";
  detail: string;
};

export type ApplyPatchHead = {
  source: string;
  backendSource: string;
  bundleEnv: string;
};

export type ApplyPatchResult = ApplyPatchHead & {
  fallbacks: ApplyPatchFallback[];
  rejections: ApplyPatchRejection[];
};

/**
 * Which files the plan permits a full-file rewrite for. `rewrite` and `add` are
 * the only kinds that can produce a fenced full replacement; `modify` and `remove`
 * must come through as patches against HEAD.
 */
function fullRewriteAllowedFiles(plan: Plan): Set<PlanFile> {
  const allow = new Set<PlanFile>();
  for (const change of plan.changes) {
    if (change.kind === "rewrite" || change.kind === "add") {
      allow.add(change.file);
    }
  }
  return allow;
}

function planKindFor(plan: Plan, file: PlanFile): PlanChangeKind | undefined {
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
  head: ApplyPatchHead,
  plan: Plan,
): ApplyPatchResult {
  let nextSource = head.source;
  let nextBackend = head.backendSource;
  let nextEnv: string | undefined = head.bundleEnv;
  const fallbacks: ApplyPatchFallback[] = [];
  const rejections: ApplyPatchRejection[] = [];

  const patchedFiles = new Set<PlanFile>();

  const parsed = parsePatch(text);
  if (parsed.ok) {
    const summary = applyPatches(parsed.patches, {
      appVue: head.source,
      appBackend: head.backendSource,
      bundleEnv: head.bundleEnv,
    });
    for (const a of summary.applied) {
      patchedFiles.add(a.file as PlanFile);
      if (a.file === "App.vue") nextSource = a.nextContent;
      else if (a.file === "App.backend.ts") nextBackend = a.nextContent;
      else if (a.file === ".env") nextEnv = a.nextContent;
    }
    for (const f of summary.fallbacks) {
      patchedFiles.add(f.file as PlanFile);
      fallbacks.push({ file: f.file, reason: f.reason, detail: f.detail });
    }
  }

  const allowFullRewrite = fullRewriteAllowedFiles(plan);

  const vueFence = extractVueFenceFromMarkdown(text);
  if (vueFence && vueFence.trim().length > 0) {
    const file: PlanFile = "App.vue";
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
    const file: PlanFile = "App.backend.ts";
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
    const file: PlanFile = ".env";
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
  fallbacks: ApplyPatchFallback[],
  rejections: ApplyPatchRejection[] = [],
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

function fileChanged(file: PatchFile, head: ApplyPatchHead, result: ApplyPatchResult): boolean {
  if (file === "App.vue") return result.source !== head.source;
  if (file === "App.backend.ts") return result.backendSource !== head.backendSource;
  return (result.bundleEnv ?? "") !== head.bundleEnv;
}

/** Merge pass-2 fixes for files that failed in pass-1; keep pass-1 successes. */
export function mergeApplyPatchRetry(
  head: ApplyPatchHead,
  pass1: ApplyPatchResult,
  pass2: ApplyPatchResult,
): ApplyPatchResult {
  const pass1FailedFiles = new Set<PatchFile>([
    ...pass1.fallbacks.map((f) => f.file as PatchFile),
    ...pass1.rejections.map((r) => r.file as PatchFile),
  ]);
  let source = pass1.source;
  let backendSource = pass1.backendSource;
  let bundleEnv = pass1.bundleEnv;
  const fallbacks: ApplyPatchFallback[] = [];
  const rejections: ApplyPatchRejection[] = [];

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
