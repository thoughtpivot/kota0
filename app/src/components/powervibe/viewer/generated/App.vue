<script setup lang="ts">
import { powervibeBundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";
import { ref, onMounted } from "vue";
// Hello world starter — iterate in AI or edit in Code.
// Call bundle Flight APIs with powervibeBundleApiUrl('api/…') — not fetch('/api/…') — so workspace Preview hits port 4000.
const backendMessage = ref<string | null>(null);

async function fetchHelloOnce(url: string): Promise<Response> {
  let r = await fetch(url);
  if (r.status === 502) {
    await new Promise<void>((fn) => setTimeout(fn, 450));
    r = await fetch(url);
  }
  return r;
}

onMounted(async () => {
  try {
    const r = await fetchHelloOnce(powervibeBundleApiUrl("api/powervibe-app/hello"));
    if (!r.ok) {
      backendMessage.value = "HTTP " + String(r.status);
      return;
    }
    const data = (await r.json()) as { message?: string };
    backendMessage.value = data.message ?? JSON.stringify(data);
  } catch {
    backendMessage.value = "(fetch failed)";
  }
});
</script>

<template>
  <div
    class="powervibe-root flex min-h-full flex-col items-center justify-center gap-3 p-6 text-neutral-800 dark:text-neutral-100"
  >
    <p class="text-lg font-medium tracking-tight">Hello, PowerVibe</p>
    <p v-if="backendMessage !== null" class="max-w-md text-center text-sm text-neutral-600 dark:text-neutral-400">
      Backend: {{ backendMessage }}
    </p>
  </div>
</template>

<style scoped>
.powervibe-root {
  font-family: ui-sans-serif, system-ui, sans-serif;
}
</style>
