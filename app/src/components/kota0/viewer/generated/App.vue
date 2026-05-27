<template>
  <div class="min-h-screen bg-stone-900 flex flex-col items-center justify-center p-4 font-mono text-stone-300">
    <div class="relative w-80 h-80 rounded-full border-8 border-stone-700 bg-stone-800 shadow-2xl flex items-center justify-center">
      <!-- Clock Face Ticks -->
      <div v-for="i in 12" :key="i" class="absolute w-full h-full" :style="{ transform: `rotate(${i * 30}deg)` }">
        <div class="w-1 h-4 bg-stone-500 mx-auto mt-2"></div>
      </div>

      <!-- Hands -->
      <div class="absolute w-2 h-24 bg-stone-100 rounded-full origin-bottom bottom-1/2 left-1/2 -ml-1 transition-transform duration-1000 ease-linear" :style="{ transform: `rotate(${hourAngle}deg)` }"></div>
      <div class="absolute w-1.5 h-32 bg-stone-300 rounded-full origin-bottom bottom-1/2 left-1/2 -ml-0.75 transition-transform duration-1000 ease-linear" :style="{ transform: `rotate(${minuteAngle}deg)` }"></div>
      <div class="absolute w-0.5 h-36 bg-amber-500 rounded-full origin-bottom bottom-1/2 left-1/2 -ml-0.25 transition-transform duration-1000 ease-linear" :style="{ transform: `rotate(${secondAngle}deg)` }"></div>
      <div class="absolute w-4 h-4 bg-stone-900 rounded-full z-10 border-2 border-stone-700"></div>
    </div>
    <div class="mt-8 text-2xl font-bold tracking-widest text-amber-500 shadow-amber-900/50">
      {{ timeString }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const hourAngle = ref(0);
const minuteAngle = ref(0);
const secondAngle = ref(0);
const timeString = ref('');

const updateTime = () => {
  const now = new Date();
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ms = now.getMilliseconds();

  secondAngle.value = (s + ms / 1000) * 6;
  minuteAngle.value = (m + s / 60) * 6;
  hourAngle.value = (h + m / 60) * 30 + (m / 60) * 0.5;
  timeString.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

let timer: number;
onMounted(() => {
  timer = window.setInterval(updateTime, 50);
});

onUnmounted(() => {
  clearInterval(timer);
});
</script>

<style scoped>
/* Retro aesthetic */
.font-mono {
  font-family: 'Courier New', Courier, monospace;
}
</style>
