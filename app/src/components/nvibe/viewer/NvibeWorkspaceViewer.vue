<script setup lang="ts">
import { ref } from "vue";
import NvibeSourceEditor from "@/components/nvibe/viewer/NvibeSourceEditor.vue";

const activeTab = defineModel<"preview" | "code">("activeTab", { required: true });
const source = defineModel<string>("source", { required: true });
const backendSource = defineModel<string>("backendSource", { required: true });
const codePanel = ref<"frontend" | "backend">("frontend");

defineProps<{
  previewPageUrl: string;
  loading: boolean;
  sourceApplying: boolean;
  dirty: boolean;
  error: string | null;
  activeAppId: string | null;
}>();

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

    <div class="relative min-h-0 flex-1 bg-[#0a0b0e]">
      <iframe
        v-show="activeTab === 'preview'"
        :key="previewPageUrl"
        :src="previewPageUrl"
        title="nVibe — Preview"
        class="absolute inset-0 h-full w-full border-0 bg-white dark:bg-neutral-950"
      />

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
            >app/src/components/nvibe/viewer/generated/App.vue (active app)</template
          >
          <template v-else>app/src/components/nvibe/viewer/generated/App.backend.ts (active app)</template>
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
        </div>
      </div>
    </div>
  </section>
</template>
