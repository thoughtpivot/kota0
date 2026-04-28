<script setup lang="ts">
import { ref } from 'vue';
import { 
  Line as LineChart, 
  Doughnut as DoughnutChart 
} from 'vue-chartjs';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  ArcElement, 
  Tooltip, 
  Legend 
} from 'chart.js';
import { Rocket, ShieldAlert, Cpu, CreditCard, X, Info, Zap, Anchor } from 'lucide-vue-next';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);

interface Ship { name: string; type: string; price: string; color: string; specs: string; description: string }

const ships: Ship[] = [
  { name: 'Vanguard Mark IV', type: 'Interceptor', price: '42,000', color: 'text-cyan-400', specs: 'Warp 4.2 / Shield 800', description: 'Frontline rapid-response chassis.' },
  { name: 'Nebula Hauler', type: 'Freight', price: '125,000', color: 'text-yellow-400', specs: '50k tons / Armor 2000', description: 'Heavy-duty deep space cargo transport.' },
  { name: 'Void Runner', type: 'Stealth', price: '89,500', color: 'text-fuchsia-400', specs: 'Minimal Sig / Ion Drive', description: 'Low-profile reconnaissance vessel.' },
];

const selectedShip = ref<Ship | null>(null);

const lineData = {
  labels: ['01', '02', '03', '04', '05', '06'],
  datasets: [{
    label: 'Market Credits',
    data: [32000, 35000, 31000, 42000, 40000, 48500],
    borderColor: '#06b6d4',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    fill: true,
    tension: 0
  }]
};

const donutData = {
  labels: ['Combat', 'Trade', 'Stealth'],
  datasets: [{
    data: [45, 30, 25],
    backgroundColor: ['#0891b2', '#ca8a04', '#c026d3'],
    borderWidth: 0
  }]
};
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-200 p-6 font-mono">
    <header class="flex justify-between items-center mb-10 border-b border-neutral-800 pb-4">
      <div class="flex items-center gap-4">
        <div class="bg-cyan-950 p-2 rounded-lg border border-cyan-800">
          <Rocket class="w-6 h-6 text-cyan-400" />
        </div>
        <h1 class="text-2xl font-black tracking-widest uppercase">Nebula Ops // Terminal</h1>
      </div>
      <button class="bg-neutral-900 border border-neutral-700 hover:border-cyan-500 px-4 py-2 text-xs uppercase tracking-tighter flex items-center gap-2 transition-all">
        <CreditCard class="w-3 h-3" /> Encrypted Sync
      </button>
    </header>

    <div class="grid grid-cols-12 gap-6">
      <div class="col-span-12 lg:col-span-8 space-y-6">
        <div class="bg-neutral-900/50 p-6 border border-neutral-800 rounded-sm">
          <div class="flex items-center gap-2 mb-6">
            <Zap class="w-4 h-4 text-cyan-500" />
            <h2 class="text-xs uppercase tracking-widest text-neutral-400">Market Fluctuations</h2>
          </div>
          <div class="h-64">
            <LineChart :data="lineData" :options="{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div v-for="ship in ships" :key="ship.name" class="bg-neutral-900 p-5 border border-neutral-800 hover:border-cyan-900 transition-all group">
            <h3 class="font-bold text-sm" :class="ship.color">{{ ship.name }}</h3>
            <p class="text-[10px] text-neutral-500 uppercase mt-1">{{ ship.type }}</p>
            <div class="h-px bg-neutral-800 my-4"></div>
            <p class="text-lg font-black">{{ ship.price }} <span class="text-xs font-normal">CR</span></p>
            <button @click="selectedShip = ship" class="w-full mt-4 bg-neutral-950 border border-neutral-700 py-2 text-[10px] uppercase hover:bg-cyan-950 hover:text-white transition-colors">
              Request Scan
            </button>
          </div>
        </div>
      </div>

      <aside class="col-span-12 lg:col-span-4 space-y-6">
        <div class="bg-neutral-900/50 p-6 border border-neutral-800 rounded-sm">
          <h2 class="text-xs uppercase tracking-widest text-neutral-400 mb-6">Fleet Composition</h2>
          <DoughnutChart :data="donutData" :options="{ responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { family: 'monospace' } } } } }" />
        </div>
        <div class="border border-neutral-800 p-6 bg-neutral-900/30">
          <div class="flex items-start gap-3">
            <ShieldAlert class="w-5 h-5 text-yellow-600 shrink-0" />
            <p class="text-[11px] leading-relaxed text-neutral-500">All transactions are logged via the Galactic Ledger. Unauthorized access to telemetry streams will trigger automatic chassis lockdown protocols.</p>
          </div>
        </div>
      </aside>
    </div>

    <!-- Overlay -->
    <div v-if="selectedShip" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end" @click="selectedShip = null">
      <div class="w-full max-w-sm bg-neutral-950 border-l border-neutral-800 p-8 shadow-2xl" @click.stop>
        <div class="flex justify-between items-center mb-10">
          <h2 class="text-xl font-bold uppercase">{{ selectedShip.name }}</h2>
          <button @click="selectedShip = null"><X class="w-5 h-5" /></button>
        </div>
        <div class="space-y-6">
          <div class="space-y-1">
            <p class="text-[10px] text-neutral-500 uppercase">Description</p>
            <p class="text-sm">{{ selectedShip.description }}</p>
          </div>
          <div class="bg-neutral-900 p-4 border border-neutral-800">
            <p class="text-[10px] text-neutral-500 uppercase mb-2">Technical Specs</p>
            <p class="font-bold text-sm">{{ selectedShip.specs }}</p>
          </div>
          <button class="w-full bg-cyan-600 text-black font-black py-4 hover:bg-cyan-500 uppercase tracking-widest text-sm flex items-center justify-center gap-2">
            <Anchor class="w-4 h-4" /> Acquire Unit
          </button>
        </div>
      </div>
    </div>
  </div>
</template>