<script setup lang="ts">
import { ref } from 'vue';
import { Coffee, Sun, Package, Sparkles, Heart, ShoppingBag } from 'lucide-vue-next';
import { Line } from 'vue-chartjs';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const chartData = {
  labels: ['Spring', 'Summer', 'Autumn', 'Winter'],
  datasets: [{
    label: 'Pony Adoption Velocity',
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
    data: [40, 70, 55, 30]
  }, {
    label: 'Pickle Barrel Turnover',
    backgroundColor: '#10b981',
    borderColor: '#10b981',
    data: [20, 80, 90, 45]
  }]
};

const chartOptions = { responsive: true, maintainAspectRatio: false };
</script>

<template>
  <div class="min-h-screen bg-neutral-50 text-neutral-900 p-8 font-sans">
    <header class="max-w-4xl mx-auto flex justify-between items-center pb-12 border-b border-neutral-200">
      <div>
        <h1 class="text-4xl font-black tracking-tighter text-amber-600">Pony & Pickle</h1>
        <p class="text-emerald-700 font-medium">Timeless whimsy in every season.</p>
      </div>
      <div class="flex gap-4">
        <button class="btn btn-primary bg-amber-500 border-none">Shop Pickles</button>
        <button class="btn btn-outline border-emerald-600 text-emerald-700">Adopt a Pony</button>
      </div>
    </header>

    <main class="max-w-4xl mx-auto py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
      <div class="card bg-white p-6 shadow-sm border border-neutral-100">
        <Coffee class="text-amber-500 mb-4" size={32} />
        <h3 class="font-bold text-lg">Springtime Brews</h3>
        <p class="text-sm text-neutral-600">Fresh roasted beans delivered while the cherry blossoms still cling to the branches.</p>
      </div>

      <div class="card bg-white p-6 shadow-sm border border-neutral-100">
        <Sun class="text-orange-500 mb-4" size={32} />
        <h3 class="font-bold text-lg">Summer in Fall</h3>
        <p class="text-sm text-neutral-600">Capture the golden hour of July even when the leaves turn a crisp, deep crimson.</p>
      </div>

      <div class="card bg-white p-6 shadow-sm border border-neutral-100">
        <Package class="text-emerald-500 mb-4" size={32} />
        <h3 class="font-bold text-lg">Artisanal Pickles</h3>
        <p class="text-sm text-neutral-600">Brined to perfection, our pickles carry the crunch of a mid-summer garden.</p>
      </div>
    </main>

    <section class="max-w-4xl mx-auto mt-8 bg-white p-8 rounded-2xl shadow-lg">
      <h2 class="text-2xl font-bold mb-6 flex items-center gap-2">
        <Sparkles class="text-rose-500" /> Market Vitality
      </h2>
      <div class="h-64">
        <Line :data="chartData" :options="chartOptions" />
      </div>
    </section>

    <footer class="max-w-4xl mx-auto mt-16 text-center text-neutral-400 text-xs">
      <p>© 2026 Pony & Pickle Co. — Curating seasons, one jar at a time.</p>
    </footer>
  </div>
</template>