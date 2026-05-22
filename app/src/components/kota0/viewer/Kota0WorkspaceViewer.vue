<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import Kota0SourceEditor from "@/components/kota0/viewer/Kota0SourceEditor.vue";
import Kota0ApplyButton from "@/components/kota0/shared/Kota0ApplyButton.vue";
import { useKota0ConsoleStream } from "@/components/kota0/viewer/useKota0ConsoleStream";

const activeTab = defineModel<"preview" | "code">("activeTab", { required: true });
const source = defineModel<string>("source", { required: true });
const backendSource = defineModel<string>("backendSource", { required: true });
const bundleEnv = defineModel<string>("bundleEnv", { required: true });
const codePanel = ref<"frontend" | "backend" | "secrets" | "console">("frontend");

const consoleStreamEnabled = computed(
  () => activeTab.value === "code" && codePanel.value === "console",
);
const { lines: flightConsoleLines } = useKota0ConsoleStream(consoleStreamEnabled);

const consoleScrollRef = ref<HTMLElement | null>(null);
watch(
  flightConsoleLines,
  async () => {
    await nextTick();
    const el = consoleScrollRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
  { deep: true },
);

const props = defineProps<{
  previewPageUrl: string;
  /** True while POST /apps is in flight — optimistic create row in rail. */
  creatingNewApp: boolean;
  /** True while POST /preview/start + bundle Flight status poll is in flight. */
  previewStarting: boolean;
  loading: boolean;
  sourceApplying: boolean;
  dirty: boolean;
  error: string | null;
  /** Active Scribe app id — bundle path `bundles/<id>/`. */
  activeAppId: string | null;
}>();

const activeAppId = computed(() => props.activeAppId);

/** True until the preview iframe fires `load` for the current `previewPageUrl`. */
const previewIframeBooting = ref(true);

/** Set when the iframe fails to load (rare cross-browser); cleared on successful load. */
const previewIframeError = ref<string | null>(null);

let previewLoadWatchdog: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.previewPageUrl,
  (url) => {
    previewIframeError.value = null;
    if (previewLoadWatchdog) {
      clearTimeout(previewLoadWatchdog);
      previewLoadWatchdog = null;
    }
    if (!url) {
      previewIframeBooting.value = false;
      return;
    }
    previewIframeBooting.value = true;
    previewLoadWatchdog = setTimeout(() => {
      previewLoadWatchdog = null;
      if (!previewIframeBooting.value) return;
      previewIframeBooting.value = false;
      previewIframeError.value =
        "Preview did not finish loading. If it works in a new tab, try matching localhost vs 127.0.0.1 in your workspace URL, or unset VITE_K0_BUNDLE_PREVIEW_ORIGIN.";
    }, 45_000);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (previewLoadWatchdog) {
    clearTimeout(previewLoadWatchdog);
    previewLoadWatchdog = null;
  }
});

function onPreviewIframeLoad() {
  previewIframeBooting.value = false;
  previewIframeError.value = null;
  if (previewLoadWatchdog) {
    clearTimeout(previewLoadWatchdog);
    previewLoadWatchdog = null;
  }
}

function onPreviewIframeError() {
  previewIframeBooting.value = false;
  previewIframeError.value =
    "Preview iframe failed to load. Open in new tab works only when this URL is blocked inside an embedded browser.";
  if (previewLoadWatchdog) {
    clearTimeout(previewLoadWatchdog);
    previewLoadWatchdog = null;
  }
}

const showPreviewOverlay = computed(
  () =>
    activeTab.value === "preview" &&
    (props.previewStarting ||
      (Boolean(props.previewPageUrl) && previewIframeBooting.value)),
);

const showPreviewEmptyState = computed(
  () =>
    activeTab.value === "preview" &&
    !props.previewPageUrl &&
    Boolean(props.activeAppId) &&
    !props.creatingNewApp &&
    !props.previewStarting,
);

const emit = defineEmits<{
  applyCode: [];
  startPreview: [];
}>();
</script>

<template>
  <section
    class="flex min-h-0 min-w-0 flex-[1.65] flex-col border-white/5 bg-[#0B0C10]/80 md:h-full md:min-h-0 md:flex-none md:border-l"
  >
    <div
      class="flex shrink-0 gap-0.5 border-b border-white/5 bg-[#0F1115]/50 px-2 pt-2"
    >
      <button
        type="button"
        class="rounded-t-md px-3 py-2 text-xs font-medium transition-colors md:text-sm"
        :class="
          activeTab === 'preview'
            ? 'bg-[#0B0C10] text-slate-100 shadow-sm ring-1 ring-inset ring-white/10'
            : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
        "
        @click="activeTab = 'preview'"
      >
        Preview
      </button>
      <button
        type="button"
        class="rounded-t-md px-3 py-2 text-xs font-medium transition-colors md:text-sm"
        :class="
          activeTab === 'code'
            ? 'bg-[#0B0C10] text-slate-100 shadow-sm ring-1 ring-inset ring-white/10'
            : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
        "
        @click="activeTab = 'code'"
      >
        Code
      </button>
    </div>

    <div class="relative min-h-[min(55vh,560px)] flex-1 bg-[#0a0b0e] md:min-h-0">
      <iframe
        v-if="previewPageUrl"
        v-show="activeTab === 'preview'"
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
          class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0a0b0e]/88 px-6 text-center backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <Loader2 class="size-10 shrink-0 animate-spin text-[#3B82F6]" aria-hidden="true" />
          <p class="text-sm font-semibold tracking-tight text-slate-100">
            {{ props.previewStarting ? "Starting preview…" : "Loading preview…" }}
          </p>
          <p class="max-w-sm text-xs leading-relaxed text-slate-500">
            First run may take a minute while npm install and vite build complete.
          </p>
        </div>
      </Transition>

      <div
        v-if="showPreviewEmptyState"
        class="absolute inset-0 z-[8] flex flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <p class="max-w-sm text-sm text-slate-300">Preview is opt-in so switching apps stays fast.</p>
        <button
          type="button"
          class="rounded-md bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#2563EB] disabled:opacity-50"
          :disabled="props.previewStarting"
          @click="emit('startPreview')"
        >
          Show app preview
        </button>
        <p class="max-w-xs text-xs text-slate-500">
          Builds the app bundle on port 4000. Required once before deploy.
        </p>
        <p v-if="error" class="max-w-sm text-xs text-rose-300/90">{{ error }}</p>
      </div>

      <div
        v-if="activeTab === 'preview' && previewIframeError && !showPreviewOverlay"
        class="pointer-events-none absolute inset-x-0 bottom-0 z-[9] bg-gradient-to-t from-[#0a0b0e] to-transparent px-3 pb-3 pt-10"
      >
        <p class="pointer-events-auto text-center text-[11px] leading-snug text-amber-200/90">
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

      <div v-show="activeTab === 'code'" class="absolute inset-0 flex min-h-0 flex-col gap-2 p-2">
        <div
          class="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 pb-2"
        >
          <div class="flex min-w-0 flex-wrap items-center gap-0.5">
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors md:text-sm"
              :class="
                codePanel === 'frontend'
                  ? 'bg-white/10 text-slate-100'
                  : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
              "
              @click="codePanel = 'frontend'"
            >
              Frontend
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors md:text-sm"
              :class="
                codePanel === 'backend'
                  ? 'bg-white/10 text-slate-100'
                  : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
              "
              @click="codePanel = 'backend'"
            >
              Backend
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors md:text-sm"
              :class="
                codePanel === 'secrets'
                  ? 'bg-white/10 text-slate-100'
                  : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
              "
              @click="codePanel = 'secrets'"
            >
              Secrets
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors md:text-sm"
              :class="
                codePanel === 'console'
                  ? 'bg-white/10 text-slate-100'
                  : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
              "
              @click="codePanel = 'console'"
            >
              Console
            </button>
          </div>
          <Kota0ApplyButton
            :applying="sourceApplying"
            :disabled="!dirty || !activeAppId"
            @apply="emit('applyCode')"
          />
        </div>
        <p v-if="error" class="shrink-0 text-xs text-rose-300/90">{{ error }}</p>
        <p v-if="loading" class="shrink-0 text-xs text-slate-500">Loading…</p>
        <div class="min-h-0 flex-1">
          <Kota0SourceEditor
            v-show="codePanel === 'frontend'"
            v-model="source"
            language="sfc"
            class="h-full min-h-0"
            :disabled="loading || !activeAppId"
          />
          <Kota0SourceEditor
            v-show="codePanel === 'backend'"
            v-model="backendSource"
            language="ts"
            class="h-full min-h-0"
            :disabled="loading || !activeAppId"
          />
          <Kota0SourceEditor
            v-show="codePanel === 'secrets'"
            v-model="bundleEnv"
            language="env"
            class="h-full min-h-0"
            :disabled="loading || !activeAppId"
          />
          <div
            v-show="codePanel === 'console'"
            ref="consoleScrollRef"
            class="min-h-0 flex-1 overflow-auto rounded-md border border-white/10 bg-[#050607]/95 font-mono text-[11px] leading-snug"
          >
            <div class="p-2">
              <div
                v-for="(ln, i) in flightConsoleLines"
                :key="`${ln.at ?? 0}-${i}-${ln.text.slice(0, 24)}`"
                :class="ln.stream === 'stderr' ? 'text-amber-200/90' : 'text-slate-300'"
              >
                {{ ln.text }}
              </div>
              <p v-if="flightConsoleLines.length === 0" class="text-slate-500">
                No Flight output yet. Apply code or switch apps to start the bundle; logs appear here when Flight runs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
