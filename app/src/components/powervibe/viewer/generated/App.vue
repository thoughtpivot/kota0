<script setup lang="ts">
import { powervibeBundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";
import { ref, onMounted } from "vue";
import { Line, Bar, Doughnut, Radar } from "vue-chartjs";
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement, 
  ArcElement, 
  RadialLinearScale, 
  Filler, 
  Title, 
  Tooltip, 
  Legend 
} from "chart.js";
import { Activity, Database, Cpu, CheckCircle } from "lucide-vue-next";

ChartJS.register(
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement, 
  ArcElement, 
  RadialLinearScale, 
  Filler, 
  Title, 
  Tooltip, 
  Legend
);

const status = ref("Connecting...");
const stats = ref({ uptime: "0%", throughput: "0", performance: [], latency: [], resources: [], success: [] });

const getChartData = (data: number[], label: string, color: string | string[]) => ({
  labels: ["1", "2", "3", "4", "5"],
  datasets: [{ label, backgroundColor: color, borderColor: color, data }]
});

onMounted(async () => {
  try {
    const r = await fetch(powervibeBundleApiUrl("api/powervibe-app/hello"));
    const data = await r.json();
    status.value = data.message;
    stats.value = data.telemetry;
  } catch (e) {
    status.value = "System Offline";
  }
});
</script>

<template>
  <div class="min-h-screen bg-neutral-50 p-8 text-neutral-900">
    <header class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Project Pulse: Enhanced</h1>
        <p class="text-neutral-500">Comprehensive Backend Telemetry</p>
      </div>
      <span class="badge badge-success gap-1 text-xs px-3 py-1 bg-green-100 text-green-700 border-green-200">
        <div class="w-2 h-2 rounded-full bg-green-500"></div> {{ status }}
      </span>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div class="card bg-white p-6 shadow-sm border border-neutral-200"><div class="flex gap-2 items-center mb-1"><Activity class="w-4 h-4 text-blue-500"/> <h3 class="text-xs font-bold uppercase text-neutral-500">Uptime</h3></div><p class="text-2xl font-bold">{{ stats.uptime }}</p></div>
      <div class="card bg-white p-6 shadow-sm border border-neutral-200"><div class="flex gap-2 items-center mb-1"><Database class="w-4 h-4 text-purple-500"/> <h3 class="text-xs font-bold uppercase text-neutral-500">Throughput</h3></div><p class="text-2xl font-bold">{{ stats.throughput }}</p></div>
      <div class="card bg-white p-6 shadow-sm border border-neutral-200"><div class="flex gap-2 items-center mb-1"><Cpu class="w-4 h-4 text-amber-500"/> <h3 class="text-xs font-bold uppercase text-neutral-500">Load</h3></div><p class="text-2xl font-bold">24%</p></div>
      <div class="card bg-white p-6 shadow-sm border border-neutral-200"><div class="flex gap-2 items-center mb-1"><CheckCircle class="w-4 h-4 text-green-500"/> <h3 class="text-xs font-bold uppercase text-neutral-500">Success</h3></div><p class="text-2xl font-bold">98.2%</p></div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card bg-white p-6 shadow-sm border border-neutral-200"><h3 class="font-semibold mb-4 text-sm uppercase text-neutral-400 tracking-wider">Performance</h3><div class="h-64"><Line :data="getChartData(stats.performance, 'Efficiency', '#3b82f6')" :options="{ responsive: true, maintainAspectRatio: false }" /></div></div>
      <div class="card bg-white p-6 shadow-sm border border-neutral-200"><h3 class="font-semibold mb-4 text-sm uppercase text-neutral-400 tracking-wider">Latency (ms)</h3><div class="h-64"><Bar :data="getChartData(stats.latency, 'Latency', '#8b5cf6')" :options="{ responsive: true, maintainAspectRatio: false }" /></div></div>
      <div class="card bg-white p-6 shadow-sm border border-neutral-200"><h3 class="font-semibold mb-4 text-sm uppercase text-neutral-400 tracking-wider">Resource Allocation</h3><div class="h-64 flex justify-center"><Doughnut :data="getChartData(stats.resources, 'Usage', ['#f59e0b', '#ef4444', '#10b981', '#3b82f6'])" :options="{ responsive: true, maintainAspectRatio: false }" /></div></div>
      <div class="card bg-white p-6 shadow-sm border border-neutral-200"><h3 class="font-semibold mb-4 text-sm uppercase text-neutral-400 tracking-wider">Stability Radar</h3><div class="h-64 flex justify-center"><Radar :data="getChartData(stats.success, 'Rate', '#ec4899')" :options="{ responsive: true, maintainAspectRatio: false }" /></div></div>
    </div>
  </div>
</template>