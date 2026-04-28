<script setup lang="ts">
import { computed } from 'vue';
import { 
  AlertOctagon, 
  AlertTriangle, 
  Info, 
  FileText, 
  ArrowRightLeft, 
  CheckCircle2, 
  XCircle, 
  ShieldAlert,
  ChevronRight
} from 'lucide-vue-next';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'vue-chartjs';

ChartJS.register(ArcElement, Tooltip, Legend);

// Chart Configuration for AI Review Findings
const chartData = computed(() => ({
  labels: ['Hard Stop', 'Soft Stop', 'Non-Blocking'],
  datasets: [
    {
      data: [5, 4, 2],
      backgroundColor: ['#ef4444', '#f97316', '#94a3b8'],
      borderColor: ['#ffffff', '#ffffff', '#ffffff'],
      borderWidth: 2,
      hoverOffset: 4
    }
  ]
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        usePointStyle: true,
        padding: 20,
        font: { family: 'ui-sans-serif, system-ui, sans-serif', size: 12 }
      }
    },
    tooltip: {
      callbacks: {
        label: (context: any) => ` ${context.label}: ${context.raw} issues`
      }
    }
  },
  cutout: '70%'
};

// Mock Data based on user submittal text
const documents = [
  { id: 'sub', name: 'SUBMITTAL_23-74-13_ClearAire_Pinnacle_RT20_ISSUES.pdf', pages: 3, status: 'Reviewed' },
  { id: 'spec', name: 'SPEC_23-74-13_Rooftop_HVAC_Units.pdf', pages: 4, status: 'Reference' }
];

const issues = [
  {
    id: 1,
    severity: 'Hard Stop',
    action: 'Kickback Required',
    title: 'Power Supply Mismatch',
    description: 'Spec requires 208V/3-phase/60Hz power supply; submittal unit is 460V/3-phase/60Hz.',
    tags: ['spec_mismatch', 'wrong_item'],
    subRef: 'Submittal · p1',
    specRef: 'Spec · p2',
    icon: AlertOctagon,
    colorClass: 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
  },
  {
    id: 2,
    severity: 'Hard Stop',
    action: 'Kickback Required',
    title: 'Filter Rating Mismatch',
    description: 'Spec requires minimum MERV-13 filter rating; submittal unit provides MERV-8 filters.',
    tags: ['spec_mismatch', 'wrong_item'],
    subRef: 'Submittal · p2',
    specRef: 'Spec · p3',
    icon: AlertOctagon,
    colorClass: 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
  },
  {
    id: 3,
    severity: 'Soft Stop',
    action: 'Substitution Decision',
    title: 'Refrigerant Type Alternate',
    description: 'Spec requires R-454B refrigerant but submittal unit uses R-410A.',
    tags: ['wrong_item', 'code_watch'],
    subRef: 'Submittal · p1',
    specRef: 'Spec · p3',
    icon: AlertTriangle,
    colorClass: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
  },
  {
    id: 4,
    severity: 'Soft Stop',
    action: 'Clarification Required',
    title: 'BACnet Communication Protocol',
    description: 'Spec requires native BACnet MS/TP communication protocol; submittal provides proprietary protocol with gateway.',
    tags: ['spec_mismatch'],
    subRef: 'Submittal · p2',
    specRef: 'Spec · p3',
    icon: AlertTriangle,
    colorClass: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
  },
  {
    id: 5,
    severity: 'Non-Blocking',
    action: 'Documentation Required',
    title: 'Warranty Term Gap',
    description: 'Spec requires minimum 5-year compressor warranty; submittal offers 3-year parts-only standard.',
    tags: ['scope_gap'],
    subRef: 'Submittal · p3',
    specRef: 'Spec · p2',
    icon: Info,
    colorClass: 'text-slate-500 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
  },
  {
    id: 6,
    severity: 'Soft Stop',
    action: 'Code / Compliance Watch',
    title: 'AIM Act Phase-down',
    description: 'Refrigerant R-410A phase-down under AIM Act; verify compliance timeline with project schedule.',
    tags: ['code_watch', 'schedule_risk'],
    subRef: 'Submittal · p1',
    specRef: 'Spec · p3',
    icon: ShieldAlert,
    colorClass: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
  }
];
</script>

<template>
  <div class="min-h-screen bg-slate-100 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8">
    <div class="mx-auto max-w-7xl space-y-6">
      
      <!-- Header Section -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold tracking-wide">
              SUBMITTAL 23-74-13
            </span>
            <span class="text-slate-400 dark:text-slate-500 text-sm">•</span>
            <span class="text-slate-500 dark:text-slate-400 text-sm flex items-center gap-1">
              <CheckCircle2 class="w-4 h-4 text-emerald-500" /> 
              7 steps complete · 3 days ago
            </span>
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            ClearAire Pinnacle RT-20
          </h1>
          <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Checking: ClearAire Systems PRT-20-460-3-GE
          </p>
        </div>
        <button class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors text-sm">
          Export Report
        </button>
      </div>

      <!-- Main Dashboard Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <!-- Left Column: Summary & Documents (4 cols) -->
        <div class="lg:col-span-4 space-y-6">
          
          <!-- Verdict Card -->
          <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-red-200 dark:border-red-900/50 relative overflow-hidden">
            <div class="absolute top-0 right-0 p-4 opacity-10">
              <XCircle class="w-24 h-24 text-red-600" />
            </div>
            <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Submittal Verdict</h2>
            <div class="flex items-center gap-3">
              <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <XCircle class="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 class="text-xl font-bold text-red-700 dark:text-red-400">
                Revise & Resubmit
              </h3>
            </div>
            <p class="text-sm text-slate-600 dark:text-slate-300 mt-4">
              Review complete. AI identified <strong class="text-slate-900 dark:text-white">11 issues</strong> across 1 product. Corrections required prior to approval.
            </p>
          </div>

          <!-- AI Review Chart -->
          <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              AI Discrepancy Analysis
            </h2>
            <div class="h-56 relative">
              <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span class="text-3xl font-bold text-slate-900 dark:text-white">11</span>
                <span class="text-xs text-slate-500 uppercase tracking-wide">Total Issues</span>
              </div>
              <Doughnut :data="chartData" :options="chartOptions" />
            </div>
          </div>

          <!-- Documents List -->
          <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Referenced Documents
            </h2>
            <ul class="space-y-3">
              <li v-for="doc in documents" :key="doc.id" class="group flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer">
                <FileText class="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {{ doc.name }}
                  </p>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {{ doc.pages }} pages • {{ doc.status }}
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- Right Column: Issue Feed (8 cols) -->
        <div class="lg:col-span-8">
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col h-full">
            <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                Detailed Findings
              </h2>
              <div class="flex gap-2">
                <button class="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
                  Filter
                </button>
                <button class="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
                  Sort
                </button>
              </div>
            </div>
            
            <div class="p-6 space-y-4 overflow-y-auto">
              <div v-for="issue in issues" :key="issue.id" 
                   class="rounded-xl border p-5 transition-all duration-200 hover:shadow-md" 
                   :class="issue.colorClass.split(' ').filter(c => c.startsWith('border')).join(' ') + ' bg-white dark:bg-slate-900'">
                
                <div class="flex items-start justify-between gap-4">
                  <div class="flex items-start gap-3">
                    <div :class="['p-2 rounded-lg mt-0.5', issue.colorClass.split(' ').filter(c => c.startsWith('bg') || c.startsWith('text')).join(' ')]">
                      <component :is="issue.icon" class="w-5 h-5" />
                    </div>
                    <div>
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-bold uppercase tracking-wide" 
                              :class="issue.severity === 'Hard Stop' ? 'text-red-600 dark:text-red-400' : (issue.severity === 'Soft Stop' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-600 dark:text-slate-400')">
                          {{ issue.action }}
                        </span>
                      </div>
                      <h4 class="text-base font-semibold text-slate-900 dark:text-white">
                        {{ issue.title }}
                      </h4>
                      <p class="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                        {{ issue.description }}
                      </p>
                    </div>
                  </div>
                  <button class="shrink-0 text-slate-400 hover:text-indigo-600 transition p-1">
                    <ChevronRight class="w-5 h-5" />
                  </button>
                </div>

                <!-- References & Tags Footer -->
                <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div class="flex items-center gap-2 text-xs font-medium bg-slate-50 dark:bg-slate-800/50 py-1.5 px-3 rounded-md border border-slate-200 dark:border-slate-700">
                    <span class="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText class="w-3.5 h-3.5" /> {{ issue.subRef }}
                    </span>
                    <ArrowRightLeft class="w-3.5 h-3.5 text-slate-400 mx-1" />
                    <span class="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText class="w-3.5 h-3.5" /> {{ issue.specRef }}
                    </span>
                  </div>
                  
                  <div class="flex gap-1.5">
                    <span v-for="tag in issue.tags" :key="tag" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-mono uppercase rounded">
                      {{ tag.replace('_', ' ') }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* Clean scrollbars for the detailed feed if fixed height added later */
::-webkit-scrollbar {
 width: 6px;
}
::-webkit-scrollbar-track {
 background: transparent;
}
::-webkit-scrollbar-thumb {
 background: #cbd5e1;
 border-radius: 4px;
}
.dark ::-webkit-scrollbar-thumb {
 background: #475569;
}
</style>