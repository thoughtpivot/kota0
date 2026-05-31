<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import Kota0SourceEditor from "@/components/kota0/viewer/Kota0SourceEditor.vue";
import Kota0ApplyButton from "@/components/kota0/shared/Kota0ApplyButton.vue";
import { useKota0ConsoleStream } from "@/components/kota0/viewer/useKota0ConsoleStream";

const source = defineModel<string>("source", { required: true });
const backendSource = defineModel<string>("backendSource", { required: true });
const bundleEnv = defineModel<string>("bundleEnv", { required: true });

const props = defineProps<{
  /** True only while the Code tab is the active viewer tab — gates the console SSE stream. */
  active: boolean;
  loading: boolean;
  sourceApplying: boolean;
  dirty: boolean;
  error: string | null;
  /** Active Scribe app id — bundle path `bundles/<id>/`. */
  activeAppId: string | null;
}>();

const emit = defineEmits<{ applyCode: [] }>();

const codePanel = ref<"frontend" | "backend" | "secrets" | "console">("frontend");

const consoleStreamEnabled = computed(() => props.active && codePanel.value === "console");
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
</script>

<template>
  <div class="absolute inset-0 flex min-h-0 flex-col gap-2 p-2">
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 pb-2">
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
</template>
