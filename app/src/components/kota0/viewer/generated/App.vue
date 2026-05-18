<script setup lang="ts">
import { kota0BundleApiUrl } from "@/components/kota0/viewer/kota0BundleApiUrl";
import { ref, onMounted } from "vue";
const current = ref({ temp: 0, precip: 0 });
const history = ref<any[]>([]);

async function updateWeather() {
  await fetch(kota0BundleApiUrl("api/kota0-app/weather/update"), { method: "POST" });
  await refresh();
}

async function refresh() {
  const r = await fetch(kota0BundleApiUrl("api/kota0-app/weather"));
  const data = await r.json();
  if (data.length > 0) {
    current.value = data[0].data;
    history.value = data;
  }
}

onMounted(async () => {
  // Trigger immediate update so we don't start at 0
  await updateWeather();
  setInterval(updateWeather, 3600000); // Hourly thereafter
});
</script>

<template>
  <div class="p-8 max-w-md mx-auto space-y-6">
    <div class="bg-blue-600 text-white p-6 rounded-2xl shadow-lg">
      <h1 class="text-xl font-bold">Sofia, Iztok</h1>
      <div class="text-5xl font-light mt-4">{{ current.temp }}°C</div>
      <p class="mt-2 text-blue-100">Precipitation: {{ current.precip }}%</p>
    </div>
    
    <div class="bg-white p-4 rounded-xl border">
      <h2 class="text-sm font-semibold text-gray-500 mb-3">History</h2>
      <ul class="space-y-2">
        <li v-for="item in history" :key="item.id" class="text-sm flex justify-between">
          <span>{{ new Date(item.data.timestamp).toLocaleTimeString() }}</span>
          <span class="font-bold">{{ item.data.temp }}°C</span>
        </li>
      </ul>
    </div>
  </div>
</template>