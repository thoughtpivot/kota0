<script setup lang="ts">
import { ref, onMounted, defineComponent, h } from 'vue';
import { Line, Bar, Radar } from 'vue-chartjs';
import {
  Chart as ChartJS, Title, Tooltip, Legend, LineElement, PointElement, 
  CategoryScale, LinearScale, BarElement, RadialLinearScale
} from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale, BarElement, RadialLinearScale);

const visibleSections = ref(new Set());
const resyncKey = ref(0);

// Narrative Data Generation
const generateLineData = () => ({ 
  labels: Array.from({length: 12}, (_, i) => `${i*2}h`), 
  datasets: [{
    label: 'Atmospheric Oscillation (THz)',
    data: Array.from({length: 12}, () => Math.random() * 40 + 20),
    borderColor: '#00f2ff', tension: 0.4, pointRadius: 0, borderWidth: 3
  }]
});

const generateBarData = () => ({ 
  labels: ['Oxygen', 'CO2', 'Nitrogen', 'Methane'],
  datasets: [{
    label: 'Chemical Density',
    data: [Math.random() * 30 + 10, Math.random() * 20 + 5, 60, Math.random() * 5],
    backgroundColor: ['#00f2ff', '#6366f1', '#f8fafc', '#4ade80']
  }]
});

const lineData = ref(generateLineData());
const barData = ref(generateBarData());
const radarData = ref({
  labels: ['Habitability', 'Liquid Water', 'Atmosphere', 'Energy Flux', 'Stability'],
  datasets: [{
    label: 'Life Index',
    data: [99.9, 98.2, 94.5, 91.0, 99.1],
    borderColor: '#00f2ff', backgroundColor: 'rgba(0, 242, 255, 0.2)'
  }]
});

const resync = () => {
  lineData.value = generateLineData();
  barData.value = generateBarData();
  resyncKey.value++;
};

onMounted(() => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => e.isIntersecting && visibleSections.value.add(e.target.id));
  }, { threshold: 0.1 });
  document.querySelectorAll('.narrative-section').forEach(s => observer.observe(s));
});

const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#1a1a1a' } }, x: { grid: { color: '#1a1a1a' } } } };
</script>

<template>
  <div class="min-h-screen bg-[#020202] text-[#f8fafc] font-sans selection:bg-[#00f2ff] selection:text-black">
    <!-- Header / Nav -->
    <nav class="fixed top-0 w-full z-50 backdrop-blur-md border-b border-white/10 px-6 py-4 flex justify-between items-center">
      <div class="flex items-center gap-3">
        <div class="w-3 h-3 bg-[#00f2ff] rounded-full animate-pulse shadow-[0_0_10px_#00f2ff]"></div>
        <span class="font-mono text-sm tracking-widest uppercase">KEPLER-186f // TRANS-LINK ACTIVE</span>
      </div>
      <button @click="resync" class="px-4 py-1.5 border border-[#00f2ff] text-[#00f2ff] font-mono text-xs hover:bg-[#00f2ff] hover:text-black transition-colors">
        FORCE RESYNC
      </button>
    </nav>

    <main class="pt-32 pb-24 max-w-6xl mx-auto px-6 space-y-32">
      <!-- Section 1: The Arrival -->
      <section id="sec1" class="narrative-section transition-all duration-1000 transform" :class="visibleSections.has('sec1') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'">
        <h1 class="text-6xl md:text-8xl font-bold tracking-tighter mb-8">THE<br/><span class="text-[#00f2ff]">KEPLER</span> PULSE</h1>
        <div class="grid md:grid-cols-3 gap-6">
          <div class="col-span-2 space-y-6">
            <p class="text-xl text-slate-400 leading-relaxed">The probe emerged from the sub-space corridor into a system bathed in the dim, crimson light of a red dwarf. Dr. Thorne watched as the first telemetry packets arrived. Kepler-186f wasn't just a rock; it was breathing.</p>
            <div class="p-6 bg-white/5 border border-white/10 rounded-xl bento-item">
              <span class="block font-mono text-[#6366f1] mb-2">[MISSION STATUS]</span>
              <p class="font-mono">ORBITAL INSERTION: OPTIMAL. SENSORS: ONLINE. ATMOSPHERE DETECTED.</p>
            </div>
          </div>
          <div class="p-6 bg-[#6366f1]/10 border border-[#6366f1]/30 rounded-xl flex flex-col justify-between">
            <div class="text-4xl font-mono">99.9%</div>
            <div class="text-xs uppercase tracking-widest opacity-60">System Integrity</div>
          </div>
        </div>
      </section>

      <!-- Section 2: The First Signal -->
      <section id="sec2" class="narrative-section transition-all duration-1000 delay-200 transform" :class="visibleSections.has('sec2') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'">
        <div class="flex flex-col md:flex-row gap-12 items-end mb-12">
          <div class="flex-1">
            <h2 class="text-3xl font-mono mb-4 text-[#00f2ff]">// 01: ATMOSPHERIC OSCILLATION</h2>
            <p class="text-slate-400">The signal wasn't noise. It was a perfect, rhythmic sine wave. "That's not physics," Thorne whispered. "That's biology on a planetary scale."</p>
          </div>
          <div class="text-right font-mono text-sm border-l border-[#00f2ff] pl-6">
            DATA TYPE: TERHERTZ BAND<br/>SOURCE: LOWER STRATOSPHERE
          </div>
        </div>
        <div class="h-64 w-full bg-white/5 rounded-2xl p-4 overflow-hidden relative">
           <Line :data="lineData" :options="chartOptions" :key="'line'+resyncKey" />
           <div class="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#020202] to-transparent opacity-20"></div>
        </div>
      </section>

      <!-- Section 3: Chemical Signature -->
      <section id="sec3" class="narrative-section transition-all duration-1000 delay-200 transform" :class="visibleSections.has('sec3') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'">
        <div class="grid md:grid-cols-2 gap-12 items-center">
           <div class="h-80 bg-white/5 rounded-2xl p-8 border border-white/5">
             <Bar :data="barData" :options="chartOptions" :key="'bar'+resyncKey" />
           </div>
           <div>
             <h2 class="text-3xl font-mono mb-6 text-[#6366f1]">// 02: METABOLIC GASES</h2>
             <p class="text-slate-400 mb-6 leading-relaxed">Oxygen levels surged every 24 hours in sync with the star's zenith. Something was exhaling across the entire northern continent. A massive, synchronized carbon-cycle was underway.</p>
             <div class="grid grid-cols-2 gap-4">
                <div class="p-4 border border-white/10 rounded-lg"> <span class="text-xs block opacity-50">CO2 DEPLETION</span> <span class="text-xl font-mono">-4.2%</span> </div>
                <div class="p-4 border border-white/10 rounded-lg"> <span class="text-xs block opacity-50">O2 PRODUCTION</span> <span class="text-xl font-mono text-[#00f2ff]">+12.8%</span> </div>
             </div>
           </div>
        </div>
      </section>

      <!-- Section 4: Conclusion -->
      <section id="sec4" class="narrative-section text-center py-24 transition-all duration-1000 transform" :class="visibleSections.has('sec4') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'">
        <h2 class="text-5xl font-bold mb-12 italic">The Verdict</h2>
        <div class="max-w-md mx-auto aspect-square mb-12">
          <Radar :data="radarData" :options="{ ...chartOptions, scales: { r: { grid: { color: 'rgba(255,255,255,0.1)' }, angleLines: { color: 'rgba(255,255,255,0.1)' }, pointLabels: { color: '#f8fafc' }, ticks: { display: false } } } }" />
        </div>
        <p class="text-2xl font-mono text-[#00f2ff] tracking-widest animate-pulse">
          PROBABILITY OF LIFE: 99.99%
        </p>
        <p class="mt-8 text-slate-500 max-w-xl mx-auto italic">
          Dr. Thorne closed the terminal. The stars looked different now. They weren't just lights in the dark; they were neighbors.
        </p>
      </section>
    </main>

    <footer class="p-12 border-t border-white/10 text-center">
      <div class="flex justify-center gap-6 mb-4 grayscale opacity-50">
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
      </div>
      <span class="font-mono text-[10px] tracking-widest opacity-30">© 2026 DEEP SPACE EXPLORATION COMMAND // END TRANSMISSION</span>
    </footer>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&family=JetBrains+Mono&display=swap');

:root {
 font-family: 'Inter', sans-serif;
}

.font-mono {
 font-family: 'JetBrains Mono', monospace;
}

body {
 background: #020202;
 overflow-x: hidden;
}

canvas {
 filter: drop-shadow(0 0 8px rgba(0, 242, 255, 0.3));
}

::selection {
 background: #00f2ff;
 color: #020202;
}
</style>