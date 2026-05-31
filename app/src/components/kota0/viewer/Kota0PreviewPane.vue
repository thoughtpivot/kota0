<script setup lang="ts">
import { AlertTriangle, Check, Circle, Loader2 } from "lucide-vue-next";
import { computed } from "vue";
import { useKota0PreviewBootstrap } from "@/components/kota0/viewer/useKota0PreviewBootstrap";
import { useKota0LoadingTipRotation } from "@/components/kota0/viewer/useKota0LoadingTipRotation";
import type {
  Kota0BundleBuildError,
  Kota0BundlePhase,
} from "@/components/kota0/apps/kota0AppApi";

const props = defineProps<{
  previewPageUrl: string;
  /** True while POST /preview/start + bundle Flight status poll is in flight. */
  previewStarting: boolean;
  /** True while POST /apps is in flight — optimistic create row in rail. */
  creatingNewApp: boolean;
  /** Active Scribe app id — bundle path `bundles/<id>/`. */
  activeAppId: string | null;
  /** Live bundle phase polled from /bundle-flight/status — drives the chain-of-thought overlay. */
  bundlePhase?: Kota0BundlePhase;
  /** Last build error from the bundle runner; surfaced in the overlay on failure. */
  lastBuildError?: Kota0BundleBuildError | null;
  error: string | null;
}>();

/** Preview iframe boot/error state + load watchdog (keyed off `previewPageUrl`). */
const { previewIframeBooting, previewIframeError, onPreviewIframeLoad, onPreviewIframeError } =
  useKota0PreviewBootstrap(() => props.previewPageUrl);

const showPreviewOverlay = computed(
  () => props.previewStarting || (Boolean(props.previewPageUrl) && previewIframeBooting.value),
);

const showPreviewEmptyState = computed(
  () =>
    !props.previewPageUrl &&
    Boolean(props.activeAppId) &&
    !props.creatingNewApp &&
    !props.previewStarting,
);

type PhaseRowStatus = "done" | "current" | "pending" | "failed";
type PhaseRowId = "installing" | "building" | "running" | "ready";
type PhaseRow = { id: PhaseRowId; label: string; status: PhaseRowStatus };

const PHASE_ORDER: readonly PhaseRowId[] = ["installing", "building", "running", "ready"];
const PHASE_LABEL: Record<PhaseRowId, string> = {
  installing: "Installing dependencies",
  building: "Building bundle",
  running: "Starting preview",
  ready: "Ready",
};

const phaseRows = computed<PhaseRow[]>(() => {
  const phase: Kota0BundlePhase = props.bundlePhase ?? "idle";
  if (phase === "failed") {
    return PHASE_ORDER.map((id) => ({
      id,
      label: PHASE_LABEL[id],
      status: id === "ready" ? ("pending" as const) : ("failed" as const),
    }));
  }
  const currentIdx =
    phase === "installing" ? 0
    : phase === "building" ? 1
    : phase === "running" ? 2
    : phase === "idle" ? 0
    : 3;
  const previewLanded =
    !props.previewStarting && !previewIframeBooting.value && Boolean(props.previewPageUrl);
  return PHASE_ORDER.map((id, idx): PhaseRow => {
    if (idx < currentIdx) return { id, label: PHASE_LABEL[id], status: "done" };
    if (idx === currentIdx) {
      if (id === "ready") {
        return { id, label: PHASE_LABEL[id], status: previewLanded ? "done" : "current" };
      }
      return { id, label: PHASE_LABEL[id], status: "current" };
    }
    return { id, label: PHASE_LABEL[id], status: "pending" };
  });
});

const overlayHeadline = computed(() => {
  const phase = props.bundlePhase;
  if (phase === "failed") return "Bundle failed";
  if (phase === "installing") return "Installing dependencies…";
  if (phase === "building") return "Building bundle…";
  if (phase === "running") return "Starting preview…";
  return props.previewStarting ? "Starting preview…" : "Loading preview…";
});

/** Rotating "did you know" tip shown while the preview overlay is up. */
const { currentTip } = useKota0LoadingTipRotation(() => props.activeAppId ?? "");
</script>

<template>
  <div class="absolute inset-0">
    <iframe
      v-if="previewPageUrl"
      :key="previewPageUrl"
      :src="previewPageUrl"
      title="Kota0 — Preview"
      class="absolute inset-0 h-full w-full border-0 bg-[#0a0b0e]"
      referrerpolicy="no-referrer"
      @load="onPreviewIframeLoad"
      @error="onPreviewIframeError"
    />

    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showPreviewOverlay"
        class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-[#0a0b0e]/88 px-6 text-center backdrop-blur-[1px]"
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2
          v-if="bundlePhase !== 'failed'"
          class="size-16 shrink-0 animate-spin text-[#3B82F6]"
          aria-hidden="true"
        />
        <AlertTriangle v-else class="size-16 shrink-0 text-amber-400" aria-hidden="true" />

        <p class="text-xl font-semibold tracking-tight text-slate-100">{{ overlayHeadline }}</p>

        <ul class="w-full max-w-md space-y-2 text-left">
          <li
            v-for="row in phaseRows"
            :key="row.id"
            class="flex items-center gap-3 text-sm md:text-base"
            :class="{
              'text-slate-200': row.status === 'current' || row.status === 'done',
              'text-slate-500': row.status === 'pending',
              'text-amber-300': row.status === 'failed',
            }"
          >
            <span class="inline-flex size-6 shrink-0 items-center justify-center">
              <Loader2 v-if="row.status === 'current'" class="size-5 animate-spin text-[#3B82F6]" aria-hidden="true" />
              <Check v-else-if="row.status === 'done'" class="size-5 text-emerald-400" aria-hidden="true" />
              <AlertTriangle v-else-if="row.status === 'failed'" class="size-5 text-amber-400" aria-hidden="true" />
              <Circle v-else class="size-3 text-slate-600" aria-hidden="true" />
            </span>
            <span>{{ row.label }}</span>
          </li>
        </ul>

        <div
          v-if="bundlePhase === 'failed' && lastBuildError"
          class="w-full max-w-md rounded-md border border-amber-400/40 bg-amber-950/30 px-3.5 py-2.5 text-left text-sm leading-snug text-amber-100"
        >
          <p class="font-semibold text-amber-200">Build error ({{ lastBuildError.kind.replace(/_/g, " ") }})</p>
          <p class="mt-1 break-words text-amber-100/90">{{ lastBuildError.message }}</p>
          <p v-if="lastBuildError.module" class="mt-1.5 text-xs text-amber-200/70">
            Module: <code class="font-mono">{{ lastBuildError.module }}</code>
          </p>
          <p class="mt-1.5 text-xs text-amber-200/60">More detail in Code → Console.</p>
        </div>

        <div
          class="w-full max-w-md rounded-md border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-sm leading-snug"
        >
          <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Tip</p>
          <p class="mt-1 font-medium text-slate-200">{{ currentTip.title }}</p>
          <p class="mt-1 text-slate-400">{{ currentTip.body }}</p>
        </div>
      </div>
    </Transition>

    <div
      v-if="showPreviewEmptyState"
      class="absolute inset-0 z-[8] flex flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <Loader2 class="size-10 animate-spin text-slate-400" aria-hidden="true" />
      <p class="max-w-md text-base text-slate-300">Preparing preview…</p>
      <p class="max-w-md text-sm text-slate-500">
        Building the app bundle on port 4000. First run may take a minute while npm install and vite build complete.
      </p>
      <div
        class="w-full max-w-md rounded-md border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-sm leading-snug"
      >
        <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Tip</p>
        <p class="mt-1 font-medium text-slate-200">{{ currentTip.title }}</p>
        <p class="mt-1 text-slate-400">{{ currentTip.body }}</p>
      </div>
      <p v-if="error" class="max-w-md text-sm text-rose-300/90">
        {{ error }} — re-prompt in chat, or edit the code directly under the Code tab.
      </p>
    </div>

    <div
      v-if="previewIframeError && !showPreviewOverlay"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-[9] bg-gradient-to-t from-[#0a0b0e] to-transparent px-3 pb-3 pt-10"
    >
      <p class="pointer-events-auto text-center text-xs leading-snug text-amber-200/90">
        {{ previewIframeError }}
        <a
          class="ml-1 font-medium text-sky-400 underline decoration-sky-400/40 underline-offset-2 hover:text-sky-300"
          :href="previewPageUrl"
          target="_blank"
          rel="noopener noreferrer"
          >Open in new tab</a
        >
      </p>
    </div>
  </div>
</template>
