<script setup lang="ts">
import { ref, computed } from "vue";
import { Bar, Line } from "vue-chartjs";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler
} from "chart.js";
import { 
  BuildingOffice2Icon, 
  ShieldCheckIcon, 
  TruckIcon, 
  BoltIcon 
} from "@heroicons/vue/24/outline";

ChartJS.register(
  Title, Tooltip, Legend, BarElement, CategoryScale, 
  LinearScale, PointElement, LineElement, Filler
);

const stats = [
  { label: "Temp Utilities", value: "$42,500", icon: BoltIcon },
  { label: "Security & Access", value: "$18,200", icon: ShieldCheckIcon },
  { label: "Site Logistics", value: "$35,900", icon: TruckIcon },
  { label: "Field Office", value: "$22,000", icon: BuildingOffice2Icon },
];

const barData = {
  labels: ["Permits", "Power", "Fencing", "Staffing", "Cleaning"],
  datasets: [{
    label: "Estimated ($)",
    backgroundColor: "#6366f1",
    data: [12000, 45000, 8000, 65000, 5000]
  }, {
    label: "Actual ($)",
    backgroundColor: "#94a3b8",
    data: [11500, 48000, 7500, 62000, 5200]
  }]
};

const chartOptions = { responsive: true, maintainAspectRatio: false };
</script>

<template>
  <div class="min-h-screen bg-neutral-50 p-8 text-neutral-900">
    <header class="mb-8">
      <h1 class="text-3xl font-bold tracking-tighter">Project Site Conditions</h1>
      <p class="text-neutral-500">Estimates and Real-time Logistics Tracking</p>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div v-for="stat in stats" :key="stat.label" class="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
        <component :is="stat.icon" class="h-6 w-6 text-indigo-600 mb-2" />
        <p class="text-sm text-neutral-500">{{ stat.label }}</p>
        <p class="text-xl font-semibold">{{ stat.value }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
        <h2 class="text-lg font-semibold mb-4">Budget Variance</h2>
        <div class="h-64">
          <Bar :data="barData" :options="chartOptions" />
        </div>
      </div>
      <div class="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
        <h2 class="text-lg font-semibold mb-4">Project Outlook</h2>
        <div class="space-y-4">
          <div v-for="item in ['Structural Steel', 'MEP Rough-in', 'Exterior Envelope']" :key="item" class="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
            <span class="font-medium">{{ item }}</span>
            <span class="text-sm text-indigo-600 font-bold">On Track</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>