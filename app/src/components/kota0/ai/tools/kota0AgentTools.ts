/**
 * Tools the apply-turn agent loop can call. Built per-request (each tool is a
 * closure over the active `appId`, the accepted `plan`, and the chat-side
 * context) so the model never has to pass an app id or plan envelope as a
 * tool argument — it can only act on the app we're applying to.
 *
 * All tools return structured JSON the model can reason over. None of them
 * throw to the model: failures become `{ ok: false, reason }` results.
 */
import { tool } from "ai";
import { z } from "zod";
import { parse as parseSfc } from "@vue/compiler-sfc";
import type { Kota0Plan, Kota0PlanFile } from "@/components/kota0/ai/kota0Plan";
import { applyModelPatchText, buildApplyRetryHint, type Kota0ApplyPatchRejection } from "@/components/kota0/ai/kota0ApplyModelPatches";
import {
  listKota0AppRevisions,
  type Kota0AppRevision,
} from "@/components/kota0/apps/ScribeKota0AppHistoryRepository";
import { ScribeKota0AppRepository } from "@/components/kota0/apps/ScribeKota0AppRepository";
import { getKota0BundleSnapshot } from "@/components/kota0/deploy/kota0BundleSnapshot";
import { restartKota0Bundle } from "@/components/kota0/deploy/kota0BundleRunner";
import { addKota0BundleDependency } from "@/components/kota0/deploy/kota0BundleAddDependency";
import { getFlightConsoleRecent } from "@/components/kota0/deploy/kota0ConsoleLogHub";
import { readKota0RuntimeErrors } from "@/components/kota0/runtime/kota0RuntimeErrorStore";
import {
  defaultIsTransient,
  shortErrorSummary,
  withRetry,
} from "@/components/kota0/ai/tools/kota0ToolRetry";
import { KOTA0_SCRIBE_BACKEND_CONTRACT } from "@/components/kota0/ai/kota0ScribeBackendContract";
import { verifyKota0AppConnectivity } from "@/components/kota0/ai/tools/kota0VerifyAppConnectivity";
import {
  normalizeKota0AppBackendForFlight,
  validateKota0AppBackendForFlight,
} from "@/components/kota0/viewer/kota0AppBackendForFlight";

export type Kota0AgentToolContext = {
  appId: string;
  plan: Kota0Plan;
  repo: ScribeKota0AppRepository;
  /** Called after a successful applyPatch to materialize + restart bundle Flight. */
  rematerialize: (next: { source: string; backendSource: string; bundleEnv?: string }) => Promise<void>;
  /** Push an assistant-visible breadcrumb that the agent loop will fold into the final chat message. */
  recordStep: (step: { tool: string; summary: string; ok: boolean }) => void;
  /**
   * Optional overrides — production wires the real bundle runner here; evals
   * pass stubs that mutate in-memory fake state. If unset, fall back to the
   * real modules. Both go through `withRetry` in the tool execute.
   */
  restartBundle?: (appId: string) => Promise<void>;
  addBundleDep?: (
    appId: string,
    packageName: string,
    version: string,
  ) => Promise<
    | { ok: true; alreadyPresent: boolean; previousVersion?: string; nextVersion: string }
    | { ok: false; reason: string }
  >;
  getBundleSnapshot?: (appId: string) => Promise<Awaited<ReturnType<typeof getKota0BundleSnapshot>>>;
};

const FilenameSchema = z.enum(["App.vue", "App.backend.ts", ".env"]).describe(
  "Which bundle file to read.",
);

function toolFailureSummary(
  fallbacks: { file: string; reason: string }[],
  rejections: { file: string; reason: string }[],
): string {
  const f = fallbacks[0];
  if (f) return `failed: ${f.reason} in ${f.file}`;
  const r = rejections[0];
  if (r) return `failed: ${r.reason} in ${r.file}`;
  return "failed";
}

function rejectInvalidBackendForApply(
  backendSource: string,
  tool: "applyChanges" | "applyPatch",
  ctx: Kota0AgentToolContext,
):
  | { ok: false; reason: "backend_validation_failed"; message: string; retryHint: string }
  | null {
  const check = validateKota0AppBackendForFlight(backendSource);
  if (check.ok) return null;
  ctx.recordStep({
    tool,
    summary: `rejected: ${check.message.slice(0, 120)}`,
    ok: false,
  });
  return {
    ok: false,
    reason: "backend_validation_failed",
    message: check.message,
    retryHint: `${check.message}\n\n${KOTA0_SCRIBE_BACKEND_CONTRACT}`,
  };
}

/**
 * Build the tool set for one agent-loop invocation. Returns a plain object
 * mapping tool names → AI SDK `Tool` definitions, ready to spread into
 * `streamText({ tools })`.
 */
export function buildKota0AgentTools(ctx: Kota0AgentToolContext) {
  return {
    getBuildSnapshot: tool({
      description:
        "Get the current build/runtime status of the active app's preview: phase (idle|installing|building|running|failed), last build error (if any), and whether bundle Flight is currently serving this app. Call this after restartPreview to verify the build succeeded.",
      inputSchema: z.object({}).strict(),
      execute: async () => {
        const snap = await (ctx.getBundleSnapshot ?? getKota0BundleSnapshot)(ctx.appId);
        ctx.recordStep({
          tool: "getBuildSnapshot",
          summary: `phase=${snap.phase}${snap.lastBuildError ? ` lastError=${snap.lastBuildError.kind}` : ""}`,
          ok: true,
        });
        return snap;
      },
    }),

    tailBundleLogs: tool({
      description:
        "Read recent stdout/stderr lines from the bundle Flight process. Useful to investigate runtime failures the structured build error didn't capture.",
      inputSchema: z
        .object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(500)
            .optional()
            .describe("Max number of lines to return (default 100, max 500)."),
        })
        .strict(),
      execute: async ({ limit }) => {
        const all = getFlightConsoleRecent();
        const max = Math.min(500, Math.max(1, limit ?? 100));
        const tail = all.slice(Math.max(0, all.length - max));
        ctx.recordStep({ tool: "tailBundleLogs", summary: `${tail.length} lines`, ok: true });
        return { lines: tail };
      },
    }),

    getRuntimeErrors: tool({
      description:
        "Read recent JavaScript errors captured from the preview iframe (window.onerror + unhandledrejection). Empty array if the bundle hasn't thrown anything since the last reload.",
      inputSchema: z
        .object({
          since: z
            .number()
            .int()
            .nonnegative()
            .optional()
            .describe("Only return errors received at or after this ms-epoch timestamp."),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .strict(),
      execute: async ({ since, limit }) => {
        const errors = readKota0RuntimeErrors(ctx.appId, { since, limit });
        ctx.recordStep({
          tool: "getRuntimeErrors",
          summary: `${errors.length} error(s)`,
          ok: true,
        });
        return { errors };
      },
    }),

    getCurrentSource: tool({
      description:
        "Read the current Scribe HEAD contents of a bundle file. Use this when you need exact line context for a patch — don't trust earlier snapshots in this conversation if the file may have changed since.",
      inputSchema: z.object({ file: FilenameSchema }).strict(),
      execute: async ({ file }) => {
        const app = await ctx.repo.getApp(ctx.appId);
        if (!app) return { ok: false, reason: "app_not_found" } as const;
        const content =
          file === "App.vue" ? app.source
          : file === "App.backend.ts" ? app.backendSource
          : (app.bundleEnv ?? "");
        ctx.recordStep({
          tool: "getCurrentSource",
          summary: `${file} (${content.length} chars)`,
          ok: true,
        });
        return { ok: true as const, file, content };
      },
    }),

    listAppRevisions: tool({
      description:
        "List recent revisions of this app from Scribe history. Each revision is a full snapshot of (source, backendSource, bundleEnv) taken when the app was last applied. Use this to ground edits in what actually shipped.",
      inputSchema: z
        .object({ limit: z.number().int().min(1).max(20).optional() })
        .strict(),
      execute: async ({ limit }) => {
        const rowId = await ctx.repo.getScribeRowIdForApp(ctx.appId);
        if (rowId === null) {
          return { ok: false, reason: "no_scribe_row" } as const;
        }
        const r = await listKota0AppRevisions(rowId, limit ?? 5);
        if (!r.ok) return { ok: false, reason: r.reason, message: r.message } as const;
        const summary: Pick<Kota0AppRevision, "when">[] = r.revisions.map((rev) => ({ when: rev.when }));
        ctx.recordStep({
          tool: "listAppRevisions",
          summary: `${r.revisions.length} revisions`,
          ok: true,
        });
        return { ok: true as const, count: r.revisions.length, revisions: summary };
      },
    }),

    applyChanges: tool({
      description:
        "Write the FULL new contents of one or more files DIRECTLY. Use this for greenfield work or for any file the plan marked `kind: \"rewrite\"` or `\"add\"` — it's faster and simpler than emitting full-file fences via `applyPatch`. Each provided file MUST have a corresponding `rewrite` or `add` change in the plan; the tool rejects writes that don't match the plan's intent. On success, persists to Scribe and re-materializes the bundle in one step.",
      inputSchema: z
        .object({
          source: z.string().optional().describe("Full new App.vue content."),
          backendSource: z.string().optional().describe("Full new App.backend.ts content."),
          bundleEnv: z.string().optional().describe("Full new bundle .env content (KEY=value lines)."),
        })
        .strict(),
      execute: async ({ source, backendSource, bundleEnv }) => {
        const provided = { source, backendSource, bundleEnv };
        const errs: { file: Kota0PlanFile; reason: string }[] = [];
        const allow = new Set<Kota0PlanFile>();
        for (const c of ctx.plan.changes) {
          if (c.kind === "rewrite" || c.kind === "add") allow.add(c.file);
        }
        if (provided.source !== undefined && !allow.has("App.vue")) {
          errs.push({ file: "App.vue", reason: 'Plan does not mark App.vue as "rewrite" or "add" — use applyPatch instead.' });
        }
        if (provided.backendSource !== undefined && !allow.has("App.backend.ts")) {
          errs.push({ file: "App.backend.ts", reason: 'Plan does not mark App.backend.ts as "rewrite" or "add" — use applyPatch instead.' });
        }
        if (provided.bundleEnv !== undefined && !allow.has(".env")) {
          errs.push({ file: ".env", reason: 'Plan does not mark .env as "rewrite" or "add" — use applyPatch instead.' });
        }
        if (errs.length > 0) {
          const parserRejections: Kota0ApplyPatchRejection[] = errs.map((e) => ({
            file: e.file,
            reason: "no_patch_emitted",
            detail: e.reason,
          }));
          ctx.recordStep({
            tool: "applyChanges",
            summary: `failed: plan_kind_mismatch in ${errs.map((e) => e.file).join(", ")}`,
            ok: false,
          });
          return {
            ok: false as const,
            reason: "plan_kind_mismatch",
            rejections: errs,
            retryHint: buildApplyRetryHint([], parserRejections),
          };
        }
        if (provided.source !== undefined) {
          const sfcParse = parseSfc(provided.source, { filename: "App.vue" });
          if (sfcParse.errors.length > 0) {
            ctx.recordStep({
              tool: "applyChanges",
              summary: `App.vue SFC parse failed (${sfcParse.errors.length} errors)`,
              ok: false,
            });
            return {
              ok: false as const,
              reason: "sfc_parse_error",
              errors: sfcParse.errors.map((e) => (e instanceof Error ? e.message : String(e))),
            };
          }
        }
        const app = await ctx.repo.getApp(ctx.appId);
        if (!app) return { ok: false as const, reason: "app_not_found" };
        const nextSource = provided.source ?? app.source;
        const nextBackend = normalizeKota0AppBackendForFlight(
          provided.backendSource ?? app.backendSource,
        );
        if (provided.backendSource !== undefined) {
          const rejected = rejectInvalidBackendForApply(nextBackend, "applyChanges", ctx);
          if (rejected) return rejected;
        }
        await ctx.repo.updateAppSources(ctx.appId, {
          source: nextSource,
          backendSource: nextBackend,
          ...(provided.bundleEnv !== undefined ? { bundleEnv: provided.bundleEnv } : {}),
        });
        await ctx.rematerialize({
          source: nextSource,
          backendSource: nextBackend,
          ...(provided.bundleEnv !== undefined ? { bundleEnv: provided.bundleEnv } : {}),
        });
        const wrote = [
          provided.source !== undefined && "App.vue",
          provided.backendSource !== undefined && "App.backend.ts",
          provided.bundleEnv !== undefined && ".env",
        ]
          .filter(Boolean)
          .join(", ");
        ctx.recordStep({
          tool: "applyChanges",
          summary: `wrote ${wrote || "(no files provided)"} (${nextSource.length + nextBackend.length} chars total)`,
          ok: true,
        });
        return {
          ok: true as const,
          wrote: {
            source: provided.source !== undefined,
            backendSource: provided.backendSource !== undefined,
            bundleEnv: provided.bundleEnv !== undefined,
          },
        };
      },
    }),

    applyPatch: tool({
      description:
        "Apply unified-diff patches (or, ONLY when the accepted plan marked a file as kind:\"rewrite\" or \"add\", a full-file fenced replacement) against current Scribe HEAD. On success the change is persisted and the bundle is re-materialized; you still must call restartPreview to rebuild and serve. On failure returns structured fallbacks (which patch hunks did not apply) and rejections (full-file fences emitted for files the plan marked modify/remove).",
      inputSchema: z
        .object({
          patchText: z
            .string()
            .min(1)
            .describe("Patch text in `=== PATCH <file> ===` blocks, or ```vue/```ts/```env fences for rewrite/add files."),
        })
        .strict(),
      execute: async ({ patchText }) => {
        const app = await ctx.repo.getApp(ctx.appId);
        if (!app) return { ok: false, reason: "app_not_found" } as const;
        const head = {
          source: app.source,
          backendSource: app.backendSource,
          bundleEnv: typeof app.bundleEnv === "string" ? app.bundleEnv : "",
        };
        const result = applyModelPatchText(patchText, head, ctx.plan);
        if (result.fallbacks.length > 0 || result.rejections.length > 0) {
          ctx.recordStep({
            tool: "applyPatch",
            summary: toolFailureSummary(result.fallbacks, result.rejections),
            ok: false,
          });
          return {
            ok: false as const,
            reason: "patch_failed",
            fallbacks: result.fallbacks,
            rejections: result.rejections,
            retryHint: buildApplyRetryHint(result.fallbacks, result.rejections),
          };
        }
        const sourceChanged = result.source !== head.source;
        const envChanged = (result.bundleEnv ?? "") !== head.bundleEnv;
        const normalizedBackend = normalizeKota0AppBackendForFlight(result.backendSource);
        const backendActuallyChanged = normalizedBackend !== head.backendSource;
        if (backendActuallyChanged) {
          const rejected = rejectInvalidBackendForApply(normalizedBackend, "applyPatch", ctx);
          if (rejected) return rejected;
        }
        if (sourceChanged || backendActuallyChanged || envChanged) {
          await ctx.repo.updateAppSources(ctx.appId, {
            source: result.source,
            backendSource: normalizedBackend,
            ...(envChanged ? { bundleEnv: result.bundleEnv } : {}),
          });
          await ctx.rematerialize({
            source: result.source,
            backendSource: normalizedBackend,
            ...(envChanged ? { bundleEnv: result.bundleEnv } : {}),
          });
        }
        ctx.recordStep({
          tool: "applyPatch",
          summary: `wrote ${[sourceChanged && "App.vue", backendActuallyChanged && "App.backend.ts", envChanged && ".env"].filter(Boolean).join(", ") || "(no-op)"}`,
          ok: true,
        });
        return {
          ok: true as const,
          changed: { source: sourceChanged, backend: backendActuallyChanged, env: envChanged },
        };
      },
    }),

    addBundleDependency: tool({
      description:
        "Add a runtime dependency to this app's bundle package.json (e.g. when a Rollup 'failed to resolve import' error tells you a module isn't installed). Retries automatically on transient filesystem contention. Does NOT trigger reinstall on its own — call restartPreview afterwards.",
      inputSchema: z
        .object({
          packageName: z.string().min(1).max(214),
          version: z.string().min(1).max(64).optional().describe('Defaults to "latest".'),
        })
        .strict(),
      execute: async ({ packageName, version }) => {
        const addFn = ctx.addBundleDep ?? addKota0BundleDependency;
        try {
          const r = await withRetry(
            () => addFn(ctx.appId, packageName, version ?? "latest"),
            {
              attempts: 2,
              baseDelayMs: 200,
              isTransient: defaultIsTransient,
              onRetry: ({ attempt, attemptsRemaining, err }) => {
                ctx.recordStep({
                  tool: "addBundleDependency",
                  summary: `retry ${attempt} (${attemptsRemaining} left): ${shortErrorSummary(err)}`,
                  ok: false,
                });
              },
            },
          );
          if (!r.ok) {
            ctx.recordStep({
              tool: "addBundleDependency",
              summary: `${packageName}: failed (${r.reason})`,
              ok: false,
            });
            return r;
          }
          ctx.recordStep({
            tool: "addBundleDependency",
            summary: `${packageName}@${r.nextVersion}${r.alreadyPresent ? " (already present)" : ""}`,
            ok: true,
          });
          return r;
        } catch (e) {
          ctx.recordStep({
            tool: "addBundleDependency",
            summary: `${packageName}: ${shortErrorSummary(e)}`,
            ok: false,
          });
          return { ok: false as const, reason: shortErrorSummary(e) };
        }
      },
    }),

    restartPreview: tool({
      description:
        "Rebuild and restart the bundle preview Flight for this app. Retries automatically on transient infra errors (EADDRINUSE, Docker daemon not ready, etc.). Returns the build snapshot after the restart completes (or fails). Call this after applyPatch or addBundleDependency to see the live result.",
      inputSchema: z.object({}).strict(),
      execute: async () => {
        const restartFn = ctx.restartBundle ?? restartKota0Bundle;
        try {
          await withRetry(() => restartFn(ctx.appId), {
            attempts: 3,
            baseDelayMs: 500,
            isTransient: defaultIsTransient,
            onRetry: ({ attempt, attemptsRemaining, err }) => {
              ctx.recordStep({
                tool: "restartPreview",
                summary: `retry ${attempt}/${attempt + attemptsRemaining}: ${shortErrorSummary(err)}`,
                ok: false,
              });
            },
          });
        } catch (e) {
          // Don't propagate to the model as a thrown error — surface the failure
          // through the snapshot it would have read next anyway.
          const snap = await (ctx.getBundleSnapshot ?? getKota0BundleSnapshot)(ctx.appId);
          ctx.recordStep({
            tool: "restartPreview",
            summary: `restart failed: ${shortErrorSummary(e)}`,
            ok: false,
          });
          return { ok: false as const, reason: "restart_failed", snapshot: snap };
        }
        const snap = await (ctx.getBundleSnapshot ?? getKota0BundleSnapshot)(ctx.appId);
        ctx.recordStep({
          tool: "restartPreview",
          summary: `phase=${snap.phase}`,
          ok: snap.phase === "running",
        });
        return { ok: true as const, snapshot: snap };
      },
    }),

    verifyAppConnectivity: tool({
      description:
        "Run a small HTTP smoke against the running bundle Flight on this app. Always probes /api/kota0-app/hello (must return { appId }). Optionally probes additional routes in `routes` (each path must start with /api/). Returns per-route { status, ok, bodySnippet } so you can fix wrong paths, missing routes, or 500s. Call this after restartPreview and before finish whenever the user expects the bundle to answer requests.",
      inputSchema: z
        .object({
          routes: z
            .array(
              z.object({
                method: z.enum(["GET", "POST"]).default("GET"),
                path: z.string().regex(/^\/api\//),
                jsonBody: z.unknown().optional(),
              }),
            )
            .max(8)
            .default([]),
        })
        .strict(),
      execute: async ({ routes }) => {
        const result = await verifyKota0AppConnectivity({ appId: ctx.appId, routes });
        const probeCount = result.probes?.length ?? 0;
        const okCount = result.probes?.filter((p) => p.ok).length ?? 0;
        ctx.recordStep({
          tool: "verifyAppConnectivity",
          summary: result.ok ? `hello ok${probeCount ? `; ${okCount}/${probeCount} routes ok` : ""}` : result.reason,
          ok: result.ok,
        });
        return result;
      },
    }),

    finish: tool({
      description:
        "Signal that the apply turn is complete. Provide a short user-facing summary of what was changed (1-3 sentences). Call this exactly once when you're done — the loop will exit immediately.",
      inputSchema: z
        .object({ summary: z.string().min(1).max(2000) })
        .strict(),
      execute: async ({ summary }) => {
        ctx.recordStep({ tool: "finish", summary, ok: true });
        return { ok: true as const, summary };
      },
    }),
  };
}

export type Kota0AgentToolSet = ReturnType<typeof buildKota0AgentTools>;
