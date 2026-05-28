<script setup lang="ts">
import { kota0BundleApiUrl } from "@/components/kota0/viewer/kota0BundleApiUrl";
import { ref, onMounted } from 'vue';
import { Droplets } from 'lucide-vue-next';

const totalHydration = ref(0);
const loading = ref(false);
const joke = ref("");
const jokes = ["Water you doing?", "Hydration nation!", "Stay fluid!", "H2-Whoa!", "Splash of joy!"];

async function fetchData() {
  const res = await fetch(kota0BundleApiUrl('api/hydration'));
  const data = await res.json();
  totalHydration.value = data.total;
  logs.value = data.logs;
}

async function addWater(amount: number) {
  loading.value = true;
  await fetch(kota0BundleApiUrl('api/hydration/add'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Number(amount) })
  });
  joke.value = jokes[Math.floor(Math.random() * jokes.length)];
  setTimeout(() => joke.value = "", 3000);
  await fetchData();
  loading.value = false;
}

async function resetData() {
  loading.value = true;
  await fetch(kota0BundleApiUrl('api/hydration'), { method: 'DELETE' });
  await fetchData();
  loading.value = false;
}

const logs = ref<{amount: number; timestamp: string}[]>([]);

onMounted(fetchData);
</script>

<template>
  <div class="min-h-screen bg-rose-50 p-6 flex flex-col items-center font-sans">
    <header class="mb-8 text-center">
      <h1 class="text-4xl font-bold text-rose-500 flex items-center justify-center gap-2">
        <Droplets class="w-8 h-8" /> HydrateMate
      </h1>
      <p class="text-rose-300 mt-2">Keep your body happy & bubbly!</p>
    </header>

    <div v-if="joke" class="fixed top-4 bg-rose-200 text-rose-700 px-6 py-3 rounded-full shadow-lg font-bold animate-bounce z-50">
      {{ joke }}
    </div>

    <div class="card w-full max-w-sm bg-white shadow-xl p-6 rounded-3xl border-t-8 border-rose-200">
      <div class="text-center mb-6">
        <div class="text-6xl font-black text-rose-400">{{ totalHydration }}ml</div>
        <div class="text-sm uppercase tracking-widest text-rose-300 mt-2">Today's Total</div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <button @click="addWater(250)" :disabled="loading" class="bg-rose-400 hover:bg-rose-500 text-white font-bold py-4 rounded-2xl shadow-md transition transform active:scale-95">250ml</button>
        <button @click="addWater(500)" :disabled="loading" class="bg-rose-500 hover:bg-rose-600 text-white font-bold py-4 rounded-2xl shadow-md transition transform active:scale-95">500ml</button>
      </div>

      <div class="mt-6 pt-6 border-t border-rose-50">
        <button @click="resetData" :disabled="loading" class="w-full text-rose-300 hover:text-rose-500 text-xs uppercase tracking-widest font-semibold transition">Reset Day</button>
      </div>
    </div>

    <div v-if="logs.length > 0" class="w-full max-w-sm mt-6">
      <h2 class="text-rose-400 font-bold mb-2 px-2">History</h2>
      <div class="bg-white rounded-3xl shadow-sm p-4 divide-y border border-rose-100">
        <div v-for="(log, i) in [...logs].reverse()" :key="i" class="py-2 flex justify-between items-center text-sm">
          <span class="font-medium text-rose-500">{{ log.amount }}ml</span>
          <span class="text-rose-200 text-xs">{{ new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
        </div>
      </div>
    </div>

    <div class="mt-8 text-rose-300 text-sm italic">
      Reminder: You will get a nudge every 30 minutes!
    </div>
  </div>
</template>