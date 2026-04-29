<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';
import { Radar } from 'vue-chartjs';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

// --- Workflow State ---
const isExecuting = ref(false);
const isComplete = ref(false);
const isModalOpen = ref(false);
const showRevision = ref(true);
const logMessages = ref<string[]>([]);
const logsContainer = ref<HTMLElement | null>(null);
const sensitivity = ref(85);
const activeRoute = ref<'Super' | 'Executive'>('Executive');
const selectedProject = ref('4200 - Michigan Central Station');

const rawLogs = [
  "[SYS] Initializing nVibe.Flow v2.5...",
  "[AUTH] Procore Sync: Michigan Central Station Active.",
  "[SCAN] Ingesting V4 Sheet Set (242 drawings).",
  "[AI] Processing structural layers...",
  "[DETECT] Variance identified: Sheet S-301 (+4.2% tonnage).",
  "[LOGIC] Routing priority detected: " + activeRoute.value,
  "[READY] Workflow analysis complete. Visual verification recommended."
];

const scrollToBottom = async () => {
  await nextTick();
  if (logsContainer.value) {
    logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
  }
};

const pushLog = (msg: string) => {
  logMessages.value.push(msg);
  scrollToBottom();
};

// --- Dynamic Chart ---
const chartData = computed(() => ({
  labels: ['Structural', 'Mechanical', 'Safety', 'Schedule', 'Cost'],
  datasets: [
    {
      label: 'AI Sensitivity',
      backgroundColor: 'rgba(139, 92, 246, 0.2)',
      borderColor: '#8b5cf6',
      pointBackgroundColor: '#8b5cf6',
      data: [sensitivity.value, 92, 88, 94, 90]
    }
  ]
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    r: {
      angleLines: { color: '#27272a' },
      grid: { color: '#27272a' },
      pointLabels: { color: '#a1a1aa', font: { size: 9 } },
      ticks: { display: false },
      suggestedMin: 0,
      suggestedMax: 100
    }
  },
  plugins: {
    legend: { display: false }
  }
};

// --- Watchers for AI Events ---
watch(selectedProject, (newVal) => {
  pushLog(`[EVENT] Project context shifted to: ${newVal}`);
});

watch(activeRoute, (newVal) => {
  pushLog(`[LOGIC] Routing policy updated: ${newVal} path prioritized.`);
});

watch(sensitivity, (newVal) => {
  // Debounce logic could be added, but for now direct feedback
  if (newVal % 5 === 0) {
    pushLog(`[RECALIBRATE] Neural sensitivity adjusted to ${newVal}%`);
  }
});

const handleExecute = () => {
  isExecuting.value = true;
  pushLog("[EVENT] Commencing workflow packet construction...");
  
  setTimeout(() => {
    pushLog(`[AI] Metadata envelope sealed for recipient: ${activeRoute.value === 'Executive' ? 'PX' : 'Super'}`);
  }, 800);

  setTimeout(() => {
    isComplete.value = true;
    isExecuting.value = false;
    pushLog("[FLOW] Dispatch successful. Packet transmitted via Procore Gateway.");
  }, 2500);
};

onMounted(() => {
  rawLogs.forEach((msg, i) => {
    setTimeout(() => {
      pushLog(msg);
    }, i * 600);
  });
});
</script>

<template>
  <div class="min-h-screen bg-[#09090b] text-zinc-300 font-sans selection:bg-violet-500/30 flex flex-col overflow-hidden">
    
    <!-- Global Navigation -->
    <header class="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-[#09090b]/80 backdrop-blur-xl z-50">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-violet-500/20">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-10h-9l1-8z"/></svg>
        </div>
        <h1 class="text-lg font-black tracking-tight text-white italic">nVibe<span class="text-violet-500">.</span>Flow</h1>
        <div class="h-4 w-px bg-zinc-800 ml-2"></div>
        <span class="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">V2.5 Orchestrator</span>
      </div>
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-2 px-3 py-1 bg-emerald-500/5 border border-emerald-500/20 rounded-full">
          <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
          <span class="text-[10px] font-bold text-emerald-500 uppercase">Procore Live</span>
        </div>
        <button class="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    </header>

    <!-- Main Flow Engine -->
    <main class="flex-1 relative flex items-center justify-center p-8">
      
      <!-- Path Visualizers -->
      <svg class="absolute inset-0 pointer-events-none w-full h-full opacity-20">
        <defs>
          <linearGradient id="beam" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#71717a" />
            <stop offset="50%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#10b981" />
          </linearGradient>
        </defs>
        <path d="M 320 400 L 600 400" stroke="url(#beam)" stroke-width="2" fill="none" stroke-dasharray="12 12" class="animate-flow-dash" />
        <path d="M 900 400 L 1150 400" stroke="url(#beam)" stroke-width="2" fill="none" stroke-dasharray="12 12" class="animate-flow-dash" />
      </svg>

      <div class="grid grid-cols-3 gap-8 w-full max-w-7xl items-stretch relative z-10">
        
        <!-- Card 1: Ingest -->
        <div class="flex flex-col gap-4">
          <div class="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-2xl relative group">
            <div class="absolute -top-3 -left-3 bg-zinc-800 px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase text-zinc-400 border border-zinc-700">Ingest Node</div>
            
            <div class="mb-6">
              <label class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Project Context</label>
              <div class="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center justify-between group-hover:border-zinc-700 transition-colors">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 bg-[#F36E21] rounded-md flex items-center justify-center shrink-0">
                    <span class="text-white font-bold text-sm">P</span>
                  </div>
                  <select v-model="selectedProject" class="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer">
                    <option value="4200 - Michigan Central Station">4200 - Michigan Central Station</option>
                    <option value="5100 - Hudson's Site">5100 - Hudson's Site</option>
                    <option value="6200 - Corktown Campus">6200 - Corktown Campus</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <div class="flex items-center justify-between text-xs">
                <span class="text-zinc-500">Detected Updates</span>
                <span class="text-violet-400 font-mono">V4_REV_02 (242)</span>
              </div>
              <button class="w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[10px] font-bold text-white flex items-center justify-center gap-2 transition-all">
                VIEW IN PROCORE
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </button>
            </div>
          </div>

          <div class="p-4 bg-zinc-950/40 border border-zinc-800/50 rounded-xl text-[10px] leading-relaxed text-zinc-500">
            Monitoring Procore webhooks for <span class="text-zinc-300">Architectural Drawings</span>. Auto-ingest triggered by version increment V3 -> V4.
          </div>
        </div>

        <!-- Card 2: Process (Sensitivity + Delta) -->
        <div class="bg-zinc-900 border-2 border-violet-500/20 rounded-[2.5rem] p-8 shadow-[0_0_50px_-12px_rgba(139,92,246,0.2)] flex flex-col items-center">
          <label class="text-[10px] font-bold text-violet-400 uppercase tracking-[0.2em] mb-6">Neural Calibration Engine</label>
          
          <div class="w-full h-48 mb-6">
            <Radar :data="chartData" :options="chartOptions" />
          </div>

          <div class="w-full space-y-2 mb-8">
            <div class="flex justify-between items-end mb-1">
              <span class="text-[10px] font-bold text-zinc-500 uppercase">Scan Sensitivity</span>
              <span class="text-xs font-mono text-violet-400">{{ sensitivity }}%</span>
            </div>
            <input type="range" v-model="sensitivity" min="50" max="100" class="w-full accent-violet-500 cursor-pointer h-1.5 bg-zinc-800 rounded-full appearance-none transition-all" />
          </div>

          <!-- Delta Mini-Map Visualization -->
          <div @click="isModalOpen = true" class="w-full bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden cursor-pointer hover:border-violet-500/50 transition-colors group/mini">
             <div class="p-2 border-b border-zinc-800 bg-zinc-900 flex justify-between">
                <span class="text-[9px] font-bold uppercase text-zinc-500">S-301 Delta Overlay</span>
                <span class="text-[9px] font-bold text-red-400">+12.4t Found</span>
             </div>
             <div class="h-24 relative bg-zinc-950 flex items-center justify-center overflow-hidden">
                <svg width="100%" height="100%" viewBox="0 0 200 100">
                   <path d="M20 20 L180 20 L180 80 L20 80 Z" fill="none" stroke="#3f3f46" stroke-width="1" />
                   <path d="M40 30 L60 30 M40 50 L80 50" stroke="#3f3f46" stroke-width="1" />
                   <path d="M120 40 L160 40 L160 60 L120 60 Z" fill="rgba(239, 68, 68, 0.1)" stroke="#ef4444" stroke-width="1.5" class="animate-pulse" />
                   <circle cx="140" cy="50" r="2" fill="#ef4444" class="animate-ping" />
                </svg>
                <div class="absolute inset-0 bg-violet-500/10 opacity-0 group-hover/mini:opacity-100 transition-opacity flex items-center justify-center">
                   <span class="text-[9px] font-bold bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-700 text-white flex items-center gap-2 shadow-xl">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                      EXPAND DELTA VIEW
                   </span>
                </div>
             </div>
          </div>
        </div>

        <!-- Card 3: Action -->
        <div class="flex flex-col gap-4">
          <div class="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-2xl relative">
            <div class="absolute -top-3 -left-3 bg-zinc-800 px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase text-zinc-400 border border-zinc-700">Action Node</div>
            
            <div class="mb-6">
              <label class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Route Logic</label>
              <div class="flex p-1 bg-zinc-950 border border-zinc-800 rounded-xl">
                <button 
                  @click="activeRoute = 'Super'"
                  :class="activeRoute === 'Super' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-600'"
                  class="flex-1 py-2 text-[9px] font-black uppercase rounded-lg transition-all"
                >
                  Superintendent
                </button>
                <button 
                  @click="activeRoute = 'Executive'"
                  :class="activeRoute === 'Executive' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-600'"
                  class="flex-1 py-2 text-[9px] font-black uppercase rounded-lg transition-all"
                >
                  Executive
                </button>
              </div>
            </div>

            <div class="bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-6">
              <div class="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-800">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#71717a"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/></svg>
                <span class="text-[9px] font-mono text-zinc-500">To: {{ activeRoute === 'Executive' ? 'px@bartonmalow.com' : 'super@bartonmalow.com' }}</span>
              </div>
              <p class="text-[10px] text-zinc-400 leading-relaxed font-mono">
                {{ activeRoute === 'Executive' ? '[High Priority] Variance Audit: Michigan Central v4. Steel tonnage deviation exceeds 4% threshold. Approval required.' : '[Notice] V4 Log Sync: minor discrepancies in door schedule S-102 noted for field verification.' }}
              </p>
            </div>

            <button 
              @click="handleExecute"
              :disabled="isExecuting"
              class="w-full py-4 rounded-xl font-black tracking-[0.2em] text-xs transition-all relative overflow-hidden group"
              :class="isComplete ? 'bg-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.3)]' : 'bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_30px_rgba(139,92,246,0.3)]'"
            >
              <span v-if="!isExecuting && !isComplete" class="flex items-center justify-center gap-2">
                EXECUTE FLOW
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
              </span>
              <span v-else-if="isExecuting" class="flex items-center justify-center gap-2">
                <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                COMPUTING...
              </span>
              <span v-else class="flex items-center justify-center gap-2 animate-pulse uppercase">
                FLOW DEPLOYED
              </span>
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- Delta Inspector Modal -->
    <div v-if="isModalOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-12 bg-black/90 backdrop-blur-sm transition-all">
       <div class="bg-zinc-900 border border-zinc-800 w-full max-w-6xl h-full rounded-[2rem] overflow-hidden flex flex-col shadow-[0_0_100px_rgba(139,92,246,0.1)]">
          <header class="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
             <div>
                <h2 class="text-white font-black tracking-tight text-xl">S-301 STRUCTURAL INSPECTOR</h2>
                <p class="text-xs text-zinc-500 uppercase tracking-widest font-mono">Michigan Central Station // Revision Delta Analysis</p>
             </div>
             <button @click="isModalOpen = false" class="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-all">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
             </button>
          </header>

          <div class="flex-1 flex overflow-hidden">
             <!-- Comparison Controls -->
             <div class="w-64 border-r border-zinc-800 p-6 flex flex-col gap-8 bg-zinc-950/30">
                <div>
                   <label class="text-[10px] font-bold text-zinc-600 uppercase mb-4 block">Layers</label>
                   <div class="space-y-2">
                      <div @click="showRevision = false" :class="!showRevision ? 'bg-violet-600/10 border-violet-500/50 text-violet-400' : 'border-zinc-800 text-zinc-500'" class="p-3 border rounded-xl cursor-pointer text-xs font-bold transition-all">
                         V3 Baseline (Current)
                      </div>
                      <div @click="showRevision = true" :class="showRevision ? 'bg-red-600/10 border-red-500/50 text-red-400' : 'border-zinc-800 text-zinc-500'" class="p-3 border rounded-xl cursor-pointer text-xs font-bold transition-all">
                         V4 AI Revision (Flagged)
                      </div>
                   </div>
                </div>

                <div class="flex-1 flex flex-col justify-end">
                   <div class="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                      <p class="text-[10px] text-zinc-400 leading-relaxed font-mono">
                         <span class="text-red-400 block mb-1">[AI Note]</span>
                         New moment connection detail detected at Grid C-14. Tonnage calc updated.
                      </p>
                   </div>
                </div>
             </div>

             <!-- Main Canvas View -->
             <div class="flex-1 bg-zinc-950 relative overflow-hidden group">
                <div class="absolute inset-0 flex items-center justify-center p-12">
                   <svg width="100%" height="100%" viewBox="0 0 800 600" class="transition-all duration-700">
                      <!-- Shared Base Grid -->
                      <g stroke="#18181b" stroke-width="1">
                         <line x1="50" y1="50" x2="750" y2="50" />
                         <line x1="50" y1="150" x2="750" y2="150" />
                         <line x1="50" y1="250" x2="750" y2="250" />
                         <line x1="50" y1="350" x2="750" y2="350" />
                         <line x1="50" y1="450" x2="750" y2="450" />
                      </g>

                      <!-- V3 Structural Plan -->
                      <g :class="showRevision ? 'opacity-20 blur-[2px]' : 'opacity-100'" class="transition-all duration-500">
                         <path d="M100 100 L400 100 L400 400 L100 400 Z" fill="none" stroke="#3f3f46" stroke-width="2" />
                         <path d="M150 150 L350 150" stroke="#3f3f46" stroke-width="2" />
                         <path d="M150 250 L350 250" stroke="#3f3f46" stroke-width="2" />
                      </g>

                      <!-- V4 AI Flags -->
                      <g v-if="showRevision" class="animate-in fade-in duration-500">
                         <path d="M420 100 L600 100 L600 450 L420 450 Z" fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="10 5" />
                         <circle cx="510" cy="275" r="40" fill="rgba(239, 68, 68, 0.1)" stroke="#ef4444" stroke-width="1.5" />
                         <text x="510" y="330" text-anchor="middle" class="fill-red-500 font-mono text-[12px] font-black">+4.2% DEVIATION</text>
                         <!-- Detail zoom window -->
                         <rect x="450" y="150" width="120" height="80" fill="#09090b" stroke="#ef4444" />
                         <path d="M460 170 L560 170 M460 190 L520 190" stroke="#ef4444" stroke-width="2" />
                      </g>
                   </svg>
                </div>
                
                <div class="absolute bottom-8 left-8 flex gap-4">
                   <div class="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-lg text-[10px] font-bold text-zinc-500">
                      ZOOM: 1.2X
                   </div>
                   <div class="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-lg text-[10px] font-bold text-zinc-500">
                      MOUSE: REL_GRID_C14
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>

    <!-- Reasoning Terminal -->
    <footer class="h-44 bg-zinc-950 border-t border-zinc-800 p-6 font-mono">
      <div class="max-w-7xl mx-auto flex flex-col h-full">
        <div class="flex items-center gap-2 mb-3 text-[10px] text-zinc-500 font-black uppercase tracking-widest">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
          AI Reasoning Logs // V2.5 Instance
        </div>
        <div 
          ref="logsContainer"
          class="flex-1 overflow-y-auto space-y-1.5 text-[11px] scrollbar-hide text-zinc-500"
        >
          <div v-for="(log, idx) in logMessages" :key="idx" class="flex items-start gap-4">
            <span class="text-zinc-800 shrink-0">{{ idx.toString().padStart(3, '0') }}</span>
            <span :class="{
              'text-violet-400': log.includes('DETECT') || log.includes('LOGIC'),
              'text-emerald-400': log.includes('FLOW'),
              'text-blue-400': log.includes('EVENT'),
              'text-amber-400': log.includes('RECALIBRATE')
            }">{{ log }}</span>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Geist+Mono:wght@400;700&display=swap');

:root {
 --font-sans: 'Inter', system-ui, sans-serif;
 --font-mono: 'Geist Mono', monospace;
}

.scrollbar-hide::-webkit-scrollbar {
 display: none;
}

@keyframes flow-dash {
 to {
 stroke-dashoffset: -24;
 }
}

.animate-flow-dash {
 animation: flow-dash 1.5s linear infinite;
}

.font-sans { font-family: var(--font-sans); }
.font-mono { font-family: var(--font-mono); }

::selection {
 background-color: rgba(139, 92, 246, 0.4);
 color: white;
}

/* Range Input Reset */
input[type="range"]::-webkit-slider-thumb {
 -webkit-appearance: none;
 appearance: none;
 width: 14px;
 height: 14px;
 background: #fff;
 border-radius: 50%;
 cursor: pointer;
 border: 2px solid #8b5cf6;
 box-shadow: 0 0 10px rgba(139, 92, 246, 0.5);
}
</style>