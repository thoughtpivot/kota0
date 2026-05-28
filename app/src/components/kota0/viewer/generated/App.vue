<template>
  <div class="min-h-screen bg-amber-50 p-8">
    <div class="max-w-4xl mx-auto text-neutral-800">
      <h1 class="text-3xl font-bold mb-6 text-amber-900">iShares Index Performance</h1>
    
    <div class="flex gap-2 mb-6">
      <button 
        v-for="tf in timeframes" 
        :key="tf"
        @click="selectedTimeframe = tf"
        :class="['px-4 py-2 rounded-lg font-medium transition', selectedTimeframe === tf ? 'bg-amber-600 text-white' : 'bg-white border border-amber-200 text-amber-900 hover:bg-amber-100']"
      >
        {{ tf.charAt(0).toUpperCase() + tf.slice(1) }}
      </button>
    </div>

    <div class="bg-white p-6 rounded-xl shadow-sm border border-amber-100 h-96">
      <Line v-if="chartData" :data="chartData" :options="chartOptions" />
      <div v-else class="flex items-center justify-center h-full text-neutral-400">Loading data...</div>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const timeframes = ['daily', 'weekly', 'monthly', 'yearly'];
const selectedTimeframe = ref('daily');
const chartData = ref(null);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: true } }
};

const fetchData = async () => {
  chartData.value = null;
  const response = await fetch(bundleApiUrl(`api/kota0-app/market-data?timeframe=${selectedTimeframe.value}`));
  const { data } = await response.json();
  
  chartData.value = {
    labels: data.world.map((d: any) => d.date),
    datasets: [{
      label: 'iShares World Index',
      data: data.world.map((d: any) => d.value),
      borderColor: '#f59e0b', // amber-500
      tension: 0.1
    }, {
      label: 'iShares Developing World Index',
      data: data.developing.map((d: any) => d.value),
      borderColor: '#ef4444', // red-500
      tension: 0.1
    }]
  };
};

watch(selectedTimeframe, fetchData);
onMounted(fetchData);
</script>
