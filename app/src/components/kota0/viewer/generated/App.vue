<template>
  <div class="min-h-screen p-8 transition-colors duration-1000" :class="activeTheme">
    <header class="mb-10 text-white flex justify-between items-center">
      <div>
        <h1 class="text-4xl font-bold">Global Weather Dashboard</h1>
        <p class="text-lg opacity-80">{{ currentTime }}</p>
      </div>
      <button 
        @click="isCelsius = !isCelsius"
        class="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-full font-bold transition-all"
      >
        Show in {{ isCelsius ? '°F' : '°C' }}
      </button>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div 
        v-for="city in cities" 
        :key="city.name"
        class="p-6 rounded-2xl text-white shadow-xl backdrop-blur-sm bg-white/10"
      >
        <h2 class="text-2xl font-semibold">{{ city.name }}</h2>
        <div class="text-5xl font-bold my-4">
          {{ displayTemp(city.temp) }}°{{ isCelsius ? 'C' : 'F' }}
        </div>
        <p class="text-xl mb-2">{{ city.condition }}</p>
        <p class="text-sm font-medium opacity-80">Precipitation: {{ city.precip }} mm</p>
        <div class="mt-6 pt-6 border-t border-white/20">
          <p class="text-sm uppercase tracking-widest opacity-70">Local Time</p>
          <p class="text-2xl font-mono">{{ getLocalTime(city.name) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { kota0BundleApiUrl } from "@/components/kota0/viewer/kota0BundleApiUrl";
import { ref, onMounted, computed } from 'vue';
import { useIntervalFn } from '@vueuse/core';
const cities = ref<any[]>([]);
const now = ref(new Date());
const isCelsius = ref(true);

useIntervalFn(() => {
  now.value = new Date();
}, 1000);

const currentTime = computed(() => now.value.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));

const activeTheme = computed(() => {
  if (cities.value.length === 0) return 'bg-gray-900';
  return cities.value[0].color || 'bg-gray-900';
});

const displayTemp = (celsius: number) => {
  if (isCelsius.value) return Math.round(celsius);
  return Math.round((celsius * 9) / 5 + 32);
};

const getLocalTime = (name: string) => {
  const timezones: Record<string, string> = {
    'Detroit': 'America/Detroit',
    'Sofia': 'Europe/Sofia',
    'Los Angeles': 'America/Los_Angeles',
    'Moscow': 'Europe/Moscow',
    'London': 'Europe/London',
    'Tokyo': 'Asia/Tokyo'
  };
  return now.value.toLocaleTimeString('en-US', { timeZone: timezones[name], hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

onMounted(async () => {
  const res = await fetch(kota0BundleApiUrl('api/weather'));
  cities.value = await res.json();
});
</script>