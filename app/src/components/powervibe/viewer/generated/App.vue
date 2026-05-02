<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useIntersectionObserver } from '@vueuse/core';
import { Line, Bar } from 'vue-chartjs';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler } from 'chart.js';
import { Trophy, TrendingUp, ShieldCheck, MapPin } from 'lucide-vue-next';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const segments = ref<any[]>([]);

const vScrollReveal = {
  mounted(el: Element) {
    el.classList.add('transition-all', 'duration-1000', 'ease-out', 'opacity-0', 'translate-y-16');
    useIntersectionObserver(ref(el), ([{ isIntersecting }]) => { 
      if (isIntersecting) {
        el.classList.remove('opacity-0', 'translate-y-16');
        el.classList.add('opacity-100', 'translate-y-0');
      }
    }, { threshold: 0.1 });
  }
};

onMounted(async () => {
  const res = await fetch(new URL('api/nvibe-app/metrics', document.baseURI)).then(r => r.json());
  segments.value = res.segments;
});
</script>

<template>
  <div class="bg-[#fdfaf6] min-h-screen text-neutral-900 pb-32">
    <header class="h-[60vh] flex flex-col justify-center px-10 max-w-7xl mx-auto">
      <h1 class="text-8xl font-black uppercase tracking-tighter">Harrington Builders</h1>
      <p class="text-3xl text-neutral-500 mt-6 max-w-2xl italic">35 years of data-driven evolution.</p>
    </header>

    <main class="max-w-5xl mx-auto px-6 space-y-48">
      <section v-for="(seg, idx) in segments" :key="seg.id" v-scroll-reveal class="grid md:grid-cols-2 gap-12 items-center">
        <div :class="idx % 2 === 0 ? '' : 'md:order-2'">
          <div class="p-4 bg-amber-100 w-fit rounded-xl mb-6"><Trophy class="w-8 h-8 text-amber-800" /></div>
          <h2 class="text-4xl font-black uppercase mb-6">{{ seg.title }}</h2>
          <p class="text-xl leading-relaxed text-neutral-700 italic border-l-4 border-amber-600 pl-6">{{ seg.story }}</p>
        </div>
        <div class="bg-white p-6 rounded-2xl shadow-xl border border-neutral-100">
          <Line :data="{ labels: ['Q1', 'Q2', 'Q3', 'Q4'], datasets: [{ label: seg.title, data: seg.values, borderColor: '#d97706', fill: true, backgroundColor: 'rgba(217, 119, 6, 0.05)' }] }" />
        </div>
      </section>
    </main>
  </div>
</template>