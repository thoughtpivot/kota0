<template>
  <div class="nc-nvibe-roadmap-layout">
    <div class="nc-nvibe-roadmap-layout__chart">
      <p class="nc-nvibe-roadmap-layout__chart-label">Phase duration · months (illustrative)</p>
      <div class="nc-nvibe-roadmap-layout__canvas">
        <Bar :data="barData" :options="barOptions" />
      </div>
    </div>
    <div class="nc-nvibe-roadmap nc-nvibe-roadmap--3" role="list">
      <div v-for="m in milestones" :key="m.title" class="nc-nvibe-roadmap__card">
        <p class="nc-nvibe-roadmap__date">{{ m.title }}</p>
        <p class="nc-nvibe-roadmap__desc">{{ m.text }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { Bar } from "vue-chartjs";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const milestones = [
  {
    title: "Months 1–2",
    text: "Concept partners with nCircle: joint demos, pilot workflows, align on first production cut-in.",
  },
  {
    title: "~Month 3",
    text: "Early adopter / pilot in production — feedback loop on agents, integrations, and enterprise readiness.",
  },
  {
    title: "Month 3 → year 1",
    text: "Harden Procore / Autodesk-facing agents, repeat GTM with nCircle’s channel, expand reference footprint before renewal talks.",
  },
] as const;

const barData = {
  labels: ["Months 1–2", "~Month 3", "Months 3–12"],
  datasets: [
    {
      label: "Months in phase",
      data: [2, 1, 9],
      backgroundColor: ["rgba(59, 130, 246, 0.65)", "rgba(96, 165, 250, 0.55)", "rgba(37, 99, 235, 0.45)"],
      borderColor: ["rgba(147, 197, 253, 0.9)", "rgba(147, 197, 253, 0.85)", "rgba(96, 165, 250, 0.75)"],
      borderWidth: 1,
      borderRadius: 6,
      maxBarThickness: 36,
    },
  ],
};

const chartText = "#cbd5e1";
const chartGrid = "rgba(255,255,255,0.06)";

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y" as const,
  animation: {
    duration: 900,
    easing: "easeOutQuart" as const,
  },
  scales: {
    x: {
      beginAtZero: true,
      grid: { color: chartGrid },
      ticks: { color: chartText, precision: 0, stepSize: 1 },
      title: { display: true, text: "Months", color: chartText, font: { size: 10 } },
    },
    y: {
      grid: { display: false },
      ticks: { color: chartText, font: { size: 10 } },
    },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label(ctx: { parsed: { x: number } }) {
          return ` ${ctx.parsed.x} mo`;
        },
      },
    },
  },
};
</script>
