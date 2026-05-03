<script setup lang="ts">
import { powervibeBundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";
import { ref } from "vue";
const thought = ref<string>("Click to discover a thought for today.");
const isLoading = ref(false);
const error = ref<string | null>(null);

async function fetchThought() {
  isLoading.value = true;
  error.value = null;
  try {
    const r = await fetch(powervibeBundleApiUrl("api/powervibe-app/thought"), { method: "POST" });
    if (!r.ok) throw new Error("Could not reach the oracle.");
    const data = (await r.json()) as { thought: string };
    thought.value = data.thought;
  } catch (e) {
    error.value = "The stream of consciousness is temporarily interrupted.";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="min-h-full flex flex-col items-center justify-center p-8 bg-neutral-50 text-neutral-900">
    <div class="max-w-lg w-full space-y-8 text-center">
      <div class="space-y-2">
        <h1 class="text-3xl font-light tracking-widest uppercase">Oracle</h1>
        <div class="w-12 h-px bg-neutral-300 mx-auto"></div>
      </div>

      <div class="min-h-[160px] flex items-center justify-center p-8 bg-white border border-neutral-200 rounded-lg shadow-sm">
        <p v-if="!isLoading" class="text-xl italic font-serif leading-relaxed text-neutral-700">
          “{{ thought }}”
        </p>
        <p v-else class="text-neutral-400 animate-pulse">Consulting the ether...</p>
      </div>

      <button 
        @click="fetchThought"
        :disabled="isLoading"
        class="px-8 py-3 bg-neutral-900 text-white font-medium hover:bg-neutral-700 transition-all disabled:opacity-50"
      >
        {{ isLoading ? "Gathering..." : "Seek Insight" }}
      </button>

      <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
    </div>
  </div>
</template>