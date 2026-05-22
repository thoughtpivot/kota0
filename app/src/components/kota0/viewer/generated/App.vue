<script setup lang="ts">
import { kota0BundleApiUrl } from "@/components/kota0/viewer/kota0BundleApiUrl";
import { ref, onMounted, onUnmounted, computed } from "vue";
import { Droplet, GlassWater, Clock } from "lucide-vue-next";

const logs = ref<{ id: number; time: string }[]>([]);
const error = ref<string | null>(null);
const loading = ref(false);
const secondsSinceLastDrink = ref(0);

const isReminderActive = computed(() => secondsSinceLastDrink.value >= 5);

const formatTime = (iso: string) => {
  const d = new Date(iso);
  // If the date is invalid (e.g. legacy "10:30" strings), return as-is
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

async function fetchLogs() {
  try {
    const r = await fetch(kota0BundleApiUrl("api/kota0-app/water-logs"));
    if (!r.ok) throw new Error("Failed to fetch logs");
    const data = await r.json();
    logs.value = data;
    
    if (data.length > 0) {
      const last = new Date(data[0].time);
      // If legacy log, treat as old (high duration)
      if (isNaN(last.getTime())) {
        secondsSinceLastDrink.value = 999;
      } else {
        secondsSinceLastDrink.value = Math.floor((Date.now() - last.getTime()) / 1000);
      }
    } else {
      secondsSinceLastDrink.value = 999;
    }
  } catch (e) {
    error.value = "Connection lost";
  }
}

async function addDrink() {
  loading.value = true;
  try {
    const r = await fetch(kota0BundleApiUrl("api/kota0-app/water-logs/add"), { method: "POST" });
    if (!r.ok) throw new Error("Could not log");
    await fetchLogs();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchLogs();
  const timer = setInterval(fetchLogs, 2000);
  onUnmounted(() => clearInterval(timer));
});
</script>

<template>
  <div class="min-h-screen bg-blue-50 dark:bg-neutral-950 p-6 flex items-center justify-center font-sans">
    <div :class="['max-w-md w-full rounded-3xl p-8 border transition-colors duration-500', isReminderActive ? 'bg-amber-100 border-amber-300' : 'bg-white border-blue-100']">
      <div class="flex items-center gap-4 mb-8">
        <div :class="['p-4 rounded-2xl', isReminderActive ? 'bg-amber-500 animate-pulse text-white' : 'bg-blue-500 text-white']">
          <Droplet :size="32" />
        </div>
        <div>
          <h1 class="text-xl font-bold">{{ isReminderActive ? 'Hydrate now!' : 'Stay hydrated' }}</h1>
          <p class="text-xs opacity-70">{{ isReminderActive ? 'It has been > 5s since your last sip.' : 'Tracking hydration...' }}</p>
        </div>
      </div>

      <button @click="addDrink" :disabled="loading" class="w-full py-4 bg-neutral-900 text-white rounded-xl font-bold flex items-center justify-center gap-2">
        <GlassWater :size="20" /> Log Water
      </button>

      <div class="mt-8 space-y-2">
        <h2 class="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Log History</h2>
        <div v-for="log in logs.slice(0, 5)" :key="log.id" class="flex items-center gap-3 p-3 bg-black/5 rounded-lg text-sm">
          <Clock :size="14" class="text-neutral-500" />
          <span>{{ formatTime(log.time) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>