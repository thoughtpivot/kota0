<script setup lang="ts">
import { Loader2, Recycle } from "lucide-vue-next";
import { nextTick, onMounted, ref, watch } from "vue";
import { fetchPowervibeSuggestAppName } from "@/components/powervibe/apps/powervibeAppApi";
import { pickPowervibeAppNameClientFallback } from "@/components/powervibe/apps/powervibeAppNameFallback";

const props = defineProps<{
  loading: boolean;
  busy: boolean;
  /** List fetch or create failure message */
  error: string | null;
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const suggestBusy = ref(false);

onMounted(() => {
  void nextTick(() => {
    if (!props.loading) inputRef.value?.focus();
  });
});

watch(
  () => props.loading,
  async (v) => {
    if (!v) await nextTick();
    if (!props.loading) inputRef.value?.focus();
  },
);

function onInput(e: Event) {
  emit("update:modelValue", (e.target as HTMLInputElement).value);
}

function onSubmit() {
  if (props.loading || props.busy) return;
  const t = props.modelValue.trim();
  if (!t) return;
  emit("submit");
}

function onFormKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    onSubmit();
  }
}

async function onSuggestName() {
  if (props.loading || props.busy || suggestBusy.value) return;
  suggestBusy.value = true;
  try {
    const r = await fetchPowervibeSuggestAppName();
    if (r.ok) {
      emit("update:modelValue", r.name);
      await nextTick();
      inputRef.value?.focus();
      return;
    }
    emit("update:modelValue", pickPowervibeAppNameClientFallback());
  } catch {
    emit("update:modelValue", pickPowervibeAppNameClientFallback());
  } finally {
    suggestBusy.value = false;
  }
}
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col items-center justify-center bg-black px-4 py-12"
    :aria-busy="loading || busy"
  >
    <div
      v-if="loading"
      class="flex flex-col items-center gap-3 text-slate-400"
      role="status"
      aria-live="polite"
    >
      <Loader2 class="size-8 animate-spin text-[#3B82F6]" aria-hidden="true" />
      <p class="text-sm tracking-wide">Loading…</p>
    </div>

    <div
      v-else
      role="dialog"
      aria-modal="true"
      aria-labelledby="powervibe-first-app-title"
      class="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0c0d11] p-8 shadow-[0_0_0_1px_rgba(59,130,246,0.06),0_24px_48px_-12px_rgba(0,0,0,0.85)]"
      @keydown="onFormKeydown"
    >
      <h2
        id="powervibe-first-app-title"
        class="font-display text-xl font-semibold tracking-[-0.03em] text-slate-100 sm:text-2xl"
      >
        Give us your first app name
      </h2>
      <p class="mt-2 text-sm leading-relaxed text-slate-500">
        We’ll open the workspace as soon as your app exists. Use the recycle control for an AI-powered suggestion
        (tap <span class="text-slate-400">Create app</span> when you’re ready).
      </p>

      <div class="relative mt-6">
        <label class="sr-only" for="powervibe-first-app-input">App name</label>
        <input
          id="powervibe-first-app-input"
          ref="inputRef"
          type="text"
          autocomplete="off"
          :value="modelValue"
          :disabled="busy"
          placeholder="My app"
          class="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-4 pr-12 text-sm text-slate-100 placeholder:text-slate-600 outline-none ring-[#3B82F6]/40 transition-shadow focus:border-[#3B82F6]/50 focus:ring-2 disabled:opacity-50"
          @input="onInput"
        />
        <button
          type="button"
          class="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-[#3B82F6] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50 disabled:pointer-events-none disabled:opacity-30"
          :disabled="busy || suggestBusy"
          aria-label="Suggest another app name"
          @click="onSuggestName"
        >
          <Loader2 v-if="suggestBusy" class="size-[1.125rem] animate-spin text-[#3B82F6]" aria-hidden="true" />
          <Recycle v-else class="size-[1.125rem]" aria-hidden="true" />
        </button>
      </div>

      <p v-if="error" class="mt-3 text-xs leading-snug text-rose-300/90" role="alert">
        {{ error }}
      </p>

      <button
        type="button"
        class="btn btn-primary mt-6 w-full rounded-xl border-0 bg-[#3B82F6] text-sm font-medium text-white hover:bg-[#2563EB] disabled:pointer-events-none disabled:opacity-40"
        :disabled="busy || !modelValue.trim()"
        @click="onSubmit()"
      >
        <Loader2 v-if="busy" class="mr-2 inline size-4 animate-spin" aria-hidden="true" />
        {{ busy ? "Creating…" : "Create app" }}
      </button>

    </div>
  </div>
</template>
