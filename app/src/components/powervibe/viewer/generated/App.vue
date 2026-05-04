<script setup lang="ts">
import { powervibeBundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";
import { ref, onMounted, onUnmounted } from "vue";
// Starter demo: rotating hellos from AI + rows in Scribe. Use powervibeBundleApiUrl('api/…') — not fetch('/api/…') — in Preview.
const headline = ref("…");
const history = ref<{ id: number; phrase: string }[]>([]);
const tickError = ref<string | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let r = await fetch(url, init);
  if (r.status === 502) {
    await new Promise<void>((fn) => setTimeout(fn, 450));
    r = await fetch(url, init);
  }
  return r;
}

async function loadGreetings(): Promise<void> {
  try {
    const r = await fetchWithRetry(powervibeBundleApiUrl("api/powervibe-app/demo-greetings"));
    const text = await r.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      if (!r.ok) {
        tickError.value = "Could not load hellos (HTTP " + String(r.status) + ", non-JSON body).";
      }
      return;
    }
    if (!r.ok) {
      const o = parsed && typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
      const msg = typeof o?.message === "string" ? o.message : "bundle or Scribe unreachable";
      tickError.value = "Could not load earlier hellos: " + msg;
      return;
    }
    const rows = parsed as { id?: unknown; phrase?: unknown }[];
    if (!Array.isArray(rows)) return;
    const mapped = rows
      .map((row) => ({
        id: typeof row.id === "number" ? row.id : Number(row.id),
        phrase: typeof row.phrase === "string" ? row.phrase : "",
      }))
      .filter((x) => Number.isFinite(x.id) && x.phrase.length > 0);
    history.value = mapped;
    if (mapped.length > 0) {
      headline.value = mapped[mapped.length - 1]!.phrase;
    }
    tickError.value = null;
  } catch (e) {
    tickError.value = e instanceof Error ? e.message : "Could not load hellos.";
  }
}

async function tickGreeting(): Promise<void> {
  try {
    const r = await fetchWithRetry(powervibeBundleApiUrl("api/powervibe-app/demo-greetings/tick"), { method: "POST" });
    const text = await r.text();
    let data: { ok?: unknown; phrase?: unknown; message?: unknown };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      tickError.value = "New hello tick returned non-JSON (HTTP " + String(r.status) + ").";
      return;
    }
    if (!r.ok) {
      const msg = typeof data.message === "string" ? data.message : "HTTP " + String(r.status);
      tickError.value = "Could not mint a new hello: " + msg;
      return;
    }
    if (typeof data.phrase === "string" && data.phrase.trim()) {
      tickError.value = null;
      headline.value = data.phrase.trim();
      await loadGreetings();
    }
  } catch (e) {
    tickError.value = e instanceof Error ? e.message : "(tick failed)";
  }
}

onMounted(async () => {
  await loadGreetings();
  await tickGreeting();
  pollTimer = setInterval(() => {
    void tickGreeting();
  }, 3000);
});

onUnmounted(() => {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});
</script>

<template>
  <div
    class="powervibe-root flex min-h-full flex-col items-center justify-center gap-5 p-6 text-neutral-800 dark:text-neutral-100"
  >
    <p class="max-w-lg text-center text-2xl font-semibold tracking-tight md:text-3xl">{{ headline }}</p>
    <p class="max-w-md text-center text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
      Turn me into whatever you want — I've got AI and a database wired up already. Hop in the chat and let's get
      started — polished, silly, or somewhere in between.
    </p>
    <p v-if="tickError !== null" class="max-w-md text-center text-xs text-amber-700 dark:text-amber-400" role="alert">
      {{ tickError }}
    </p>
    <div v-if="history.length > 0" class="mt-1 w-full max-w-md">
      <p class="mb-2 text-center text-xs text-neutral-500">Earlier hellos</p>
      <ul
        class="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        <li v-for="row in history" :key="row.id" class="truncate text-neutral-700 dark:text-neutral-300">
          {{ row.phrase }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.powervibe-root {
  font-family: ui-sans-serif, system-ui, sans-serif;
}
</style>
