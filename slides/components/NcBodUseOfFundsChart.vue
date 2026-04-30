<template>
  <div class="nc-powervibe-useofunds" aria-label="Illustrative first-year use of funds: $250K">
    <div class="nc-powervibe-useofunds__canvas">
      <Doughnut :data="chartData" :options="chartOptions" />
    </div>
    <p class="nc-powervibe-useofunds__note">
      Illustrative use of funds within a <strong>$250K</strong> year-one envelope — final allocation subject to finance and
      legal.
    </p>
  </div>
</template>

<script setup lang="ts">
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "vue-chartjs";

ChartJS.register(ArcElement, Tooltip, Legend);

const chartData = {
  labels: ["Lead product & delivery (~$10K/mo)", "Lexis Solutions engineer (~$5K/mo)", "Cloud, inference & GTM balance"],
  datasets: [
    {
      data: [120, 60, 70],
      backgroundColor: ["rgba(59, 130, 246, 0.85)", "rgba(14, 165, 233, 0.75)", "rgba(16, 185, 129, 0.65)"],
      borderColor: "rgba(15, 17, 21, 0.95)",
      borderWidth: 3,
      hoverOffset: 6,
    },
  ],
};

const legendColor = "#cbd5e1";

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "54%",
  animation: {
    animateRotate: true,
    animateScale: true,
    duration: 1000,
    easing: "easeOutQuart" as const,
  },
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: {
        boxWidth: 10,
        padding: 14,
        font: { size: 10, family: "Manrope, sans-serif" },
        color: legendColor,
      },
    },
    tooltip: {
      callbacks: {
        label(ctx: { parsed: number; label: string }) {
          return ` ${ctx.label}: $${ctx.parsed}K`;
        },
      },
    },
  },
};
</script>
