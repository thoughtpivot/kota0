<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import NvibeSourceEditor from "@/components/nvibe/viewer/NvibeSourceEditor.vue";
import { useNvibeConsoleStream } from "@/components/nvibe/viewer/useNvibeConsoleStream";

const activeTab = defineModel<"preview" | "code">("activeTab", { required: true });
const source = defineModel<string>("source", { required: true });
const backendSource = defineModel<string>("backendSource", { required: true });
const bundleEnv = defineModel<string>("bundleEnv", { required: true });
const codePanel = ref<"frontend" | "backend" | "secrets" | "console">("frontend");

const consoleStreamEnabled = computed(
  () => activeTab.value === "code" && codePanel.value === "console",
);
const { lines: flightConsoleLines } = useNvibeConsoleStream(consoleStreamEnabled);

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
        "Preview did not finish loading. If it works in a new tab, try matching localhost vs 127.0.0.1 in your workspace URL, or unset VITE_NVIBE_BUNDLE_PREVIEW_ORIGIN.";
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
    (props.loading || previewIframeBooting.value),
);

const emit = defineEmits<{
  applyCode: [];
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
        title="nVibe — Preview"
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
          class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0a0b0e]/88 backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <div
            class="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent"
            aria-hidden="true"
          />
          <p class="text-xs font-medium text-slate-400">Loading app…</p>
        </div>
      </Transition>

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
          <button
            type="button"
            class="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-[#3B82F6] px-3 text-xs font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="sourceApplying || !dirty || !activeAppId"
            @click="emit('applyCode')"
          >
            {{ sourceApplying ? "Applying…" : "Apply" }}
          </button>
        </div>
        <p v-if="error" class="shrink-0 text-xs text-rose-300/90">{{ error }}</p>
        <p v-if="loading" class="shrink-0 text-xs text-slate-500">Loading…</p>
        <p class="shrink-0 truncate text-xs text-slate-500">
          <template v-if="codePanel === 'frontend'"
            >bundles/{{ activeAppId ?? "…" }}/App.vue — mirrored to viewer/generated for tooling</template
          >
          <template v-else-if="codePanel === 'backend'"
            >bundles/{{ activeAppId ?? "…" }}/App.backend.ts (Flight prod on port 4000)</template
          >
          <template v-else-if="codePanel === 'secrets'"
            >bundles/{{ activeAppId ?? "…" }}/.env — Scribe + Apply; values also on disk for bundle Flight</template
          >
          <template v-else
            >Bundle Flight on 127.0.0.1:4000 — stdout/stderr (runtime only; build/install still in the terminal)</template
          >
        </p>
        <p
          v-if="codePanel === 'secrets'"
          class="shrink-0 text-[11px] leading-snug text-slate-500/90"
        >
          Secrets are stored in Scribe with this app and written to the bundle on Apply. Treat DB backups as sensitive.
        </p>
        <p
          v-if="codePanel === 'console'"
          class="shrink-0 text-[11px] leading-snug text-slate-500/90"
        >
          Logs from the bundle Flight child process. Open this tab after Apply or app switch to stream output.
        </p>
        <div class="min-h-0 flex-1">
          <NvibeSourceEditor
            v-show="codePanel === 'frontend'"
            v-model="source"
            language="sfc"
            class="h-full min-h-0"
            :disabled="loading || !activeAppId"
          />
          <NvibeSourceEditor
            v-show="codePanel === 'backend'"
            v-model="backendSource"
            language="ts"
            class="h-full min-h-0"
            :disabled="loading || !activeAppId"
          />
          <NvibeSourceEditor
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
