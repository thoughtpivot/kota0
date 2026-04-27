<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  CloudSun,
  Users,
  ShieldCheck,
  Plus,
  MessageSquare,
  CheckCircle2,
  Lock,
  ChevronRight,
  Filter,
  HardHat,
  ClipboardList,
  X
} from 'lucide-vue-next';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale
} from 'chart.js';
import { Bar } from 'vue-chartjs';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Types
type Trade = 'Interstate Electrical' | 'Steel Prime' | 'Foundation Corp' | 'Climate Control';
type Status = 'draft' | 'locked';

interface Worklog {
  id: number;
  timestamp: string;
  trade: Trade;
  manpower: number;
  description: string;
  assignedTo: { name: string; avatar: string };
  status: Status;
  comments: number;
}

// State
const activeFilter = ref<Trade | 'All'>('All');
const isModalOpen = ref(false);
const trades: Trade[] = ['Interstate Electrical', 'Steel Prime', 'Foundation Corp', 'Climate Control'];

const logs = ref<Worklog[]>([
  {
    id: 1,
    timestamp: '07:42 AM',
    trade: 'Interstate Electrical',
    manpower: 24,
    description: 'Began Sector B conduit runs. Verified stub-ups against latest architectural revision. No discrepancies found.',
    assignedTo: { name: 'Marcus Chen', avatar: 'MC' },
    status: 'locked',
    comments: 3
  },
  {
    id: 2,
    timestamp: '09:15 AM',
    trade: 'Steel Prime',
    manpower: 48,
    description: 'Level 4 decking 80% complete. Safety inspection of perimeter cable passed. Crane cycles efficient despite wind gusts.',
    assignedTo: { name: 'Sarah Miller', avatar: 'SM' },
    status: 'draft',
    comments: 0
  },
  {
    id: 3,
    timestamp: '11:30 AM',
    trade: 'Foundation Corp',
    manpower: 12,
    description: 'Backfilling Retaining Wall C. Soil density tests scheduled for 14:00. Compaction meeting spec.',
    assignedTo: { name: 'Jim Vance', avatar: 'JV' },
    status: 'draft',
    comments: 1
  }
]);

// Computed
const filteredLogs = computed(() => {
  if (activeFilter.value === 'All') return logs.value;
  return logs.value.filter(l => l.trade === activeFilter.value);
});

const totalManpower = computed(() => logs.value.reduce((acc, log) => acc + log.manpower, 0) + 58); // + general staff

const chartData = computed(() => ({
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
  datasets: [
    {
      label: 'Site Manpower',
      data: [110, 125, 138, 142, 135, 90, totalManpower.value],
      backgroundColor: (ctx: any) => {
        const val = ctx.raw;
        return val > 130 ? '#22d3ee' : '#fbbf24';
      },
      borderRadius: 4,
    }
  ]
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1e1e1e',
      titleColor: '#22d3ee',
      borderColor: '#333',
      borderWidth: 1
    }
  },
  scales: {
    y: { display: false },
    x: {
      grid: { display: false },
      ticks: { color: '#666', font: { family: 'Geist Mono', size: 10 } }
    }
  }
};

// Actions
const toggleApproval = (id: number) => {
  const log = logs.value.find(l => l.id === id);
  if (log && log.status === 'draft') {
    log.status = 'locked';
  }
};

const addLog = () => {
  // Placeholder for modal logic
  isModalOpen.value = false;
};
</script>

<template>
  <div class="min-h-screen bg-[#121212] text-slate-100 font-sans selection:bg-cyan-500 selection:text-black">
    
    <!-- Header: The Pulse -->
    <header class="sticky top-0 z-40 bg-[#121212]/80 backdrop-blur-md border-b border-white/5">
      <div class="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-amber-400 text-black flex items-center justify-center rounded-sm font-black">
            L
          </div>
          <h1 class="text-xs font-mono tracking-widest uppercase text-slate-400 hidden sm:block">
            The Ledger // <span class="text-cyan-400">Field Intelligence</span>
          </h1>
        </div>

        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2 text-xs font-mono text-cyan-400">
            <CloudSun class="w-4 h-4" />
            <span>68°F</span>
          </div>
          <div class="flex items-center gap-2 text-xs font-mono text-amber-400">
            <Users class="w-4 h-4" />
            <span>{{ totalManpower }}</span>
          </div>
          <div class="flex items-center gap-2 text-xs font-mono text-emerald-400">
            <ShieldCheck class="w-4 h-4" />
            <span>0</span>
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto p-4 space-y-8 pb-32">
      
      <!-- Manpower Dynamics (Chart) -->
      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-[10px] uppercase font-mono tracking-[0.2em] text-slate-500">Manpower Dynamics</h2>
          <div class="flex gap-1 overflow-x-auto">
            <button 
              v-for="t in ['All', ...trades]" 
              :key="t"
              @click="activeFilter = (t as any)"
              :class="[
                'px-3 py-1 text-[10px] font-mono border rounded-full transition-all whitespace-nowrap',
                activeFilter === t ? 'border-cyan-400 text-cyan-400 bg-cyan-400/10' : 'border-white/10 text-slate-500 hover:border-white/20'
              ]"
            >
              {{ t }}
            </button>
          </div>
        </div>
        <div class="h-40 w-full bg-black/40 border border-white/5 rounded-lg p-4">
          <Bar :data="chartData" :options="chartOptions" />
        </div>
      </section>

      <!-- Feed: The Narrative -->
      <section class="space-y-6">
        <h2 class="text-[10px] uppercase font-mono tracking-[0.2em] text-slate-500">Chronological Feed</h2>
        
        <div class="relative space-y-4">
          <div 
            v-for="log in filteredLogs" 
            :key="log.id"
            :class="[
              'relative group border-l-2 pl-4 transition-all duration-500',
              log.status === 'locked' ? 'border-cyan-500 shadow-[0_0_15px_-5px_rgba(34,211,238,0.2)]' : 'border-slate-700'
            ]"
          >
            <!-- Timestamp Line -->
            <div class="absolute -left-[9px] top-1 w-4 h-4 bg-[#121212] border-2 rounded-full z-10" :class="log.status === 'locked' ? 'border-cyan-500' : 'border-slate-700'"></div>

            <div class="bg-white/5 border border-white/5 rounded-lg p-4 hover:bg-white/[0.07] transition-colors">
              <div class="flex justify-between items-start mb-3">
                <div class="space-y-1">
                  <span class="text-[10px] font-mono text-slate-500">{{ log.timestamp }}</span>
                  <div class="flex items-center gap-2">
                    <h3 class="text-sm font-bold text-slate-200">{{ log.trade }}</h3>
                    <span class="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-sm uppercase tracking-tight">
                      {{ log.manpower }} PAX
                    </span>
                  </div>
                </div>
                
                <button 
                  @click="toggleApproval(log.id)"
                  class="transition-all"
                  :disabled="log.status === 'locked'"
                >
                  <div v-if="log.status === 'draft'" class="flex items-center gap-1 text-[9px] font-mono bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-1 rounded cursor-pointer hover:bg-amber-400/20">
                    <ClipboardList class="w-3 h-3" /> DRAFT
                  </div>
                  <div v-else class="flex items-center gap-1 text-[9px] font-mono bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 px-2 py-1 rounded">
                    <Lock class="w-3 h-3" /> VERIFIED
                  </div>
                </button>
              </div>

              <p class="text-slate-300 leading-relaxed text-sm mb-4">
                {{ log.description }}
              </p>

              <div class="flex items-center justify-between pt-3 border-t border-white/5">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white border border-white/10">
                    {{ log.assignedTo.avatar }}
                  </div>
                  <span class="text-[10px] text-slate-400 font-mono">{{ log.assignedTo.name }}</span>
                </div>

                <div class="flex items-center gap-3">
                   <button class="flex items-center gap-1 text-slate-500 hover:text-cyan-400 transition-colors">
                    <MessageSquare class="w-4 h-4" />
                    <span class="text-[10px] font-mono">{{ log.comments }}</span>
                  </button>
                  <ChevronRight class="w-4 h-4 text-slate-700" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Mobile FAB -->
    <button 
      @click="isModalOpen = true"
      class="fixed bottom-8 right-8 w-14 h-14 bg-amber-400 text-black rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-50"
    >
      <Plus class="w-6 h-6 stroke-[3]" />
    </button>

    <!-- Input Modal Overlay -->
    <div v-if="isModalOpen" class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div class="absolute inset-0 bg-black/90 backdrop-blur-sm" @click="isModalOpen = false"></div>
      <div class="relative w-full max-w-lg bg-[#1a1a1a] border-t sm:border border-white/10 rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-bold flex items-center gap-2 text-amber-400">
            <HardHat class="w-5 h-5" /> Log New Activity
          </h3>
          <button @click="isModalOpen = false" class="p-2 hover:bg-white/5 rounded-full text-slate-500">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-[10px] font-mono text-slate-500 uppercase uppercase tracking-widest">Trade</label>
              <select class="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm text-slate-300 focus:border-cyan-400 outline-none">
                <option v-for="t in trades" :key="t">{{ t }}</option>
              </select>
            </div>
            <div class="space-y-2">
              <label class="text-[10px] font-mono text-slate-500 uppercase uppercase tracking-widest">Manpower</label>
              <input type="number" placeholder="0" class="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm text-slate-300 focus:border-cyan-400 outline-none" />
            </div>
          </div>
          
          <div class="space-y-2">
            <label class="text-[10px] font-mono text-slate-500 uppercase uppercase tracking-widest">Work Performed</label>
            <textarea 
              rows="4"
              placeholder="Enter chronological updates..."
              class="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm text-slate-300 focus:border-cyan-400 outline-none resize-none"
            ></textarea>
          </div>

          <button 
            @click="addLog"
            class="w-full bg-cyan-500 text-black font-bold py-3 rounded-lg hover:bg-cyan-400 transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle2 class="w-5 h-5" /> COMMIT TO LEDGER
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Geist Mono mapping */
.font-mono {
 font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

/* Subtle weathered texture overlay */
main::before {
 content: "";
 position: fixed;
 top: 0;
 left: 0;
 width: 100%;
 height: 100%;
 background-image: url("https://www.transparenttextures.com/patterns/dark-leather.png");
 opacity: 0.03;
 pointer-events: none;
 z-index: 1;
}

::-webkit-scrollbar {
 width: 6px;
}
::-webkit-scrollbar-track {
 background: #121212;
}
::-webkit-scrollbar-thumb {
 background: #333;
 border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
 background: #444;
}
</style>