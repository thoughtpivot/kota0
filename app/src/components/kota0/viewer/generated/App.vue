<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { 
  Database, ShieldCheck, Clock, Copy, Search, 
  Table2, Layers, GitMerge, CheckCircle2, 
  ChevronRight, TerminalSquare, AlertCircle
} from 'lucide-vue-next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Line, Doughnut } from 'vue-chartjs';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, 
  Title, Tooltip, Legend, ArcElement, Filler
);

// Core State
const searchQuery = ref('');
const activeTab = ref('schema'); // 'schema', 'lineage', 'sample', 'consumers'
const ddlCopied = ref(false);

// Mock Schema Data
const tableSchema = ref([
  { name: 'worker_id', type: 'BIGINT', nullable: false, desc: 'Unique, immutable identifier for the construction worker.', popularity: 98 },
  { name: 'site_id', type: 'VARCHAR(50)', nullable: false, desc: 'UUID of the active construction site assignment.', popularity: 85 },
  { name: 'check_in_time', type: 'TIMESTAMP', nullable: true, desc: 'Exact UTC timestamp the worker badge was scanned via IoT terminal.', popularity: 72 },
  { name: 'hours_logged', type: 'DECIMAL(5,2)', nullable: false, desc: 'Total hours calculated for the shift. Used for payroll.', popularity: 95 },
  { name: 'is_contractor', type: 'BOOLEAN', nullable: true, desc: 'Flag indicating if the worker is a third-party subcontractor.', popularity: 45 },
  { name: 'hourly_rate', type: 'DECIMAL(10,2)', nullable: true, desc: 'Worker base hourly rate (Masked via Unity Catalog for non-HR roles).', popularity: 30 },
  { name: 'incident_reports', type: 'INT', nullable: true, desc: 'Number of safety incidents logged during the shift.', popularity: 15 }
]);

// Interactions & Computations
const filteredSchema = computed(() => {
  if (!searchQuery.value) return tableSchema.value;
  const q = searchQuery.value.toLowerCase();
  return tableSchema.value.filter(c => 
    c.name.toLowerCase().includes(q) || 
    c.desc.toLowerCase().includes(q) ||
    c.type.toLowerCase().includes(q)
  );
});

const copyDDL = () => {
  const cols = tableSchema.value.map(c => `  ${c.name} ${c.type}${c.nullable ? '' : ' NOT NULL'}`).join(',\n');
  const stmt = `CREATE TABLE prod_construction_catalog.logistics.daily_manpower (\n${cols}\n) USING DELTA;`;
  navigator.clipboard.writeText(stmt);
  ddlCopied.value = true;
  setTimeout(() => ddlCopied.value = false, 2000);
};

const getTierColor = (popularity: number) => {
  if (popularity >= 80) return '#FFD700'; // Gold
  if (popularity >= 50) return '#C0C0C0'; // Silver
  return '#CD7F32'; // Bronze
};

// Chart Configs: Data Freshness
const freshnessData = {
  labels: ['Freshness', 'Lag'],
  datasets: [{
    data: [98, 2],
    backgroundColor: ['#10B981', '#1f2937'],
    borderColor: ['#059669', '#111827'],
    borderWidth: 1,
    cutout: '82%'
  }]
};
const freshnessOptions = {
  responsive: true, 
  maintainAspectRatio: false, 
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  animation: { animateScale: true }
};

// Chart Configs: Lineage Flow (Bronze -> Silver -> Gold)
const lineageData = {
  labels: ['s3_raw_timesheets (Bronze)', 'cleaned_workforce_logs (Silver)', 'daily_manpower (Gold)'],
  datasets: [{
    label: 'Pipeline Dependency',
    data: [2, 2, 2],
    borderColor: '#FF3621', // Databricks Red
    borderWidth: 3,
    borderDash: [6, 6],
    pointBackgroundColor: ['#CD7F32', '#C0C0C0', '#FFD700'], // Tier Colors
    pointBorderColor: '#080916',
    pointBorderWidth: 4,
    pointRadius: 16,
    pointHoverRadius: 20,
    fill: false,
    tension: 0
  }]
};
const lineageOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: { display: false, min: 0, max: 4 },
    x: {
      grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
      ticks: { color: '#C0C0C0', font: { family: 'Fira Code', size: 13 }, padding: 20 }
    }
  },
  plugins: { 
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(8, 9, 22, 0.95)',
      titleFont: { family: 'Inter', size: 14 },
      bodyFont: { family: 'Inter', size: 13 },
      borderColor: '#FF3621',
      borderWidth: 1,
      padding: 12
    }
  }
};
</script>

<template>
  <div class="min-h-screen bg-[#080916] text-[#C0C0C0] font-sans selection:bg-[#FF3621]/30 selection:text-white pb-24 relative overflow-hidden">
    <!-- Ambient Glow Effects -->
    <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FF3621]/10 blur-[120px] rounded-full pointer-events-none"></div>
    <div class="absolute bottom-[-10%] right-[-10%] w-[30%] h-[40%] bg-[#FFD700]/5 blur-[120px] rounded-full pointer-events-none"></div>

    <!-- Top Navigation / Header -->
    <header class="w-full border-b border-white/5 bg-[#080916]/80 backdrop-blur-md sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <!-- Breadcrumbs -->
        <div class="flex items-center space-x-2 text-sm font-mono tracking-tight">
          <Database class="w-4 h-4 text-[#FF3621]" />
          <span class="text-[#FFD700] hover:text-white cursor-pointer transition-colors">prod_construction_catalog</span>
          <ChevronRight class="w-4 h-4 text-white/30" />
          <span class="text-[#C0C0C0] hover:text-white cursor-pointer transition-colors">logistics</span>
          <ChevronRight class="w-4 h-4 text-white/30" />
          <span class="text-white font-medium">daily_manpower</span>
        </div>
        <!-- Databricks Logo -->
        <img 
          src="https://www.databricks.com/wp-content/uploads/2021/04/Databricks-Logo.png" 
          alt="Databricks"
          class="h-5 invert opacity-90 brightness-200"
        />
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-6 mt-8 space-y-8 relative z-10">
      
      <!-- Table Anatomy Hero -->
      <section class="relative rounded-xl bg-white/[0.02] border border-[#FF3621]/30 p-8 shadow-[0_0_20px_rgba(255,54,33,0.1)] backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-8 overflow-hidden">
        <!-- Circuit Decoration -->
        <div class="absolute right-0 top-0 w-64 h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9InJnYmEoMjU1LDU0LDMzLDAuMSkiLz48L3N2Zz4=')] opacity-30"></div>

        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <div class="bg-gradient-to-br from-[#FFD700]/20 to-transparent p-2 rounded-lg border border-[#FFD700]/40">
              <Table2 class="w-8 h-8 text-[#FFD700]" />
            </div>
            <h1 class="text-4xl font-bold text-white tracking-tight">daily_manpower</h1>
          </div>
          
          <div class="flex flex-wrap items-center gap-4 text-sm">
            <div class="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              <ShieldCheck class="w-4 h-4 text-[#FFD700]" />
              <span class="text-[#FFD700] font-medium">Certified Gold</span>
            </div>
            <div class="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              <span class="text-white/50">Owner:</span>
              <span class="text-white">Data Eng Team Alpha</span>
            </div>
            <div class="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              <span class="text-white/50">Format:</span>
              <span class="font-mono text-[#C0C0C0]">DELTA</span>
            </div>
          </div>
          <p class="text-white/60 max-w-2xl leading-relaxed">
            Aggregated daily logistics and workforce metrics derived from IoT gateway scans and HR contractor data. Optimized for executive dashboards and resource forecasting models.
          </p>
        </div>

        <!-- Freshness Gauge -->
        <div class="relative w-40 h-40 flex-shrink-0">
          <Doughnut :data="freshnessData" :options="freshnessOptions" />
          <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <Clock class="w-5 h-5 text-[#10B981] mb-1" />
            <span class="text-xl font-bold text-white">12m</span>
            <span class="text-[10px] text-white/50 uppercase tracking-wider">Ago (DLT)</span>
          </div>
        </div>
      </section>

      <!-- Interactive Tabs -->
      <div class="flex items-center space-x-1 border-b border-white/10">
        <button 
          v-for="(tab, id) in { schema: 'Schema Matrix', lineage: 'Pipeline Lineage', sample: 'Sample Data', consumers: 'Downstream Usage' }" 
          :key="id"
          @click="activeTab = id"
          :class="[
            'px-5 py-3 text-sm font-medium transition-all relative',
            activeTab === id ? 'text-white' : 'text-white/40 hover:text-white/80'
          ]"
        >
          {{ tab }}
          <div v-if="activeTab === id" class="absolute bottom-0 left-0 w-full h-[2px] bg-[#FF3621] shadow-[0_0_8px_rgba(255,54,33,0.8)]"></div>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="min-h-[400px]">
        
        <!-- SCHEMA MATRIX TAB -->
        <div v-if="activeTab === 'schema'" class="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div class="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5">
            <div class="relative w-full max-w-md">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input 
                v-model="searchQuery"
                type="text"
                placeholder="Filter columns, types, or descriptions..."
                class="w-full bg-transparent border-none text-white text-sm pl-10 pr-4 py-2 focus:ring-0 focus:outline-none placeholder:text-white/20"
              />
            </div>
            <button 
              @click="copyDDL"
              class="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-sm transition-all text-white shrink-0"
            >
              <CheckCircle2 v-if="ddlCopied" class="w-4 h-4 text-[#10B981]" />
              <Copy v-else class="w-4 h-4 text-white/60" />
              {{ ddlCopied ? 'DDL Copied!' : 'Copy DDL' }}
            </button>
          </div>

          <div class="border border-white/10 rounded-xl overflow-hidden bg-[#080916]/50">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-white/[0.03] border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
                  <th class="p-4 font-medium">Column Name</th>
                  <th class="p-4 font-medium">Data Type</th>
                  <th class="p-4 font-medium">Nullability</th>
                  <th class="p-4 font-medium w-1/3">Business Description</th>
                  <th class="p-4 font-medium">Query Popularity</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                <tr 
                  v-for="col in filteredSchema" 
                  :key="col.name"
                  class="hover:bg-white/[0.02] transition-colors group"
                >
                  <td class="p-4 font-mono text-sm text-white group-hover:text-[#FF3621] transition-colors">
                    {{ col.name }}
                  </td>
                  <td class="p-4 font-mono text-xs text-[#FFD700]/80">
                    {{ col.type }}
                  </td>
                  <td class="p-4">
                    <span 
                      :class="[
                        'text-[10px] px-2 py-0.5 rounded font-mono uppercase border',
                        col.nullable ? 'bg-white/5 text-white/40 border-white/10' : 'bg-[#FF3621]/10 text-[#FF3621] border-[#FF3621]/30'
                      ]"
                    >
                      {{ col.nullable ? 'Nullable' : 'Not Null' }}
                    </span>
                  </td>
                  <td class="p-4 text-sm text-white/60 leading-relaxed">
                    {{ col.desc }}
                  </td>
                  <td class="p-4">
                    <div class="flex items-center gap-3">
                      <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          class="h-full rounded-full transition-all duration-1000"
                          :style="{ width: `${col.popularity}%`, backgroundColor: getTierColor(col.popularity) }"
                        ></div>
                      </div>
                      <span class="text-xs font-mono text-white/40 w-8 text-right">{{ col.popularity }}%</span>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredSchema.length === 0">
                  <td colspan="5" class="p-12 text-center text-white/30">
                    <AlertCircle class="w-8 h-8 mx-auto mb-3 opacity-50" />
                    No columns match your filter.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- LINEAGE TAB -->
        <div v-if="activeTab === 'lineage'" class="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div class="bg-[#080916]/50 border border-white/10 rounded-xl p-8 relative overflow-hidden">
            <!-- Grid Background -->
            <div class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] opacity-30"></div>
            
            <div class="relative z-10 mb-8 flex items-center gap-3">
              <GitMerge class="w-6 h-6 text-[#FF3621]" />
              <h2 class="text-xl font-bold text-white">Delta Live Tables Pipeline</h2>
            </div>

            <div class="relative h-64 w-full z-10">
              <Line :data="lineageData" :options="lineageOptions" />
            </div>

            <div class="relative z-10 mt-8 grid grid-cols-3 gap-6">
              <div class="p-4 rounded-lg border border-[#CD7F32]/20 bg-[#CD7F32]/5">
                <h3 class="text-[#CD7F32] font-mono text-sm mb-2">[Bronze] s3_raw_timesheets</h3>
                <p class="text-xs text-white/50">Raw JSON ingestion from physical gateway sensors. Append-only stream.</p>
              </div>
              <div class="p-4 rounded-lg border border-[#C0C0C0]/20 bg-[#C0C0C0]/5">
                <h3 class="text-[#C0C0C0] font-mono text-sm mb-2">[Silver] cleaned_workforce_logs</h3>
                <p class="text-xs text-white/50">Expectations enforced: valid UUIDs, parsed timestamps. Invalid records quarantined.</p>
              </div>
              <div class="p-4 rounded-lg border border-[#FFD700]/20 bg-[#FFD700]/5">
                <h3 class="text-[#FFD700] font-mono text-sm mb-2">[Gold] daily_manpower</h3>
                <p class="text-xs text-white/50">Aggregated daily rollups. Ready for BI consumption and ML forecasting.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- SAMPLE DATA TAB -->
        <div v-if="activeTab === 'sample'" class="animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div class="border border-white/10 rounded-xl overflow-x-auto bg-[#080916]/50">
            <table class="w-full text-left whitespace-nowrap">
              <thead>
                <tr class="bg-white/[0.03] border-b border-white/10 text-xs font-mono text-white/40">
                  <th class="p-4">worker_id</th>
                  <th class="p-4">site_id</th>
                  <th class="p-4">check_in_time</th>
                  <th class="p-4">hours_logged</th>
                  <th class="p-4">is_contractor</th>
                  <th class="p-4">hourly_rate</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5 text-sm font-mono text-white/70">
                <tr class="hover:bg-white/[0.02]">
                  <td class="p-4 text-[#FFD700]">1009842</td>
                  <td class="p-4">site_alpha_09</td>
                  <td class="p-4">2026-04-26 08:01:22</td>
                  <td class="p-4">8.50</td>
                  <td class="p-4 text-[#10B981]">false</td>
                  <td class="p-4 text-white/20">***</td>
                </tr>
                <tr class="hover:bg-white/[0.02]">
                  <td class="p-4 text-[#FFD700]">1009843</td>
                  <td class="p-4">site_omega_12</td>
                  <td class="p-4">2026-04-26 07:45:10</td>
                  <td class="p-4">10.00</td>
                  <td class="p-4 text-[#FF3621]">true</td>
                  <td class="p-4 text-white/20">***</td>
                </tr>
                <tr class="hover:bg-white/[0.02]">
                  <td class="p-4 text-[#FFD700]">1009844</td>
                  <td class="p-4">site_alpha_09</td>
                  <td class="p-4">2026-04-26 08:15:00</td>
                  <td class="p-4">8.00</td>
                  <td class="p-4 text-[#10B981]">false</td>
                  <td class="p-4 text-white/20">***</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-xs text-white/30 mt-4 text-center font-mono"><TerminalSquare class="inline w-3 h-3 mr-1"/> SELECT * FROM daily_manpower LIMIT 3;</p>
        </div>

        <!-- DOWNSTREAM TAB -->
        <div v-if="activeTab === 'consumers'" class="animate-in fade-in slide-in-from-bottom-4 duration-500 grid md:grid-cols-2 gap-4">
          <div class="border border-white/10 bg-white/[0.02] rounded-xl p-5 hover:border-[#FFD700]/30 transition-colors">
             <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center gap-2 mb-2">
                    <Layers class="w-4 h-4 text-[#C0C0C0]" />
                    <h4 class="font-medium text-white">Executive Logistics Dashboard</h4>
                  </div>
                  <p class="text-sm text-white/50">Tableau visualization tracking multi-site resource allocation and daily burn rate.</p>
                </div>
                <span class="text-xs font-mono bg-white/10 px-2 py-1 rounded text-white/60">BI Tool</span>
             </div>
          </div>
          <div class="border border-white/10 bg-white/[0.02] rounded-xl p-5 hover:border-[#FFD700]/30 transition-colors">
             <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center gap-2 mb-2">
                    <Database class="w-4 h-4 text-[#C0C0C0]" />
                    <h4 class="font-medium text-white">ml_overtime_predictor</h4>
                  </div>
                  <p class="text-sm text-white/50">Databricks AutoML model predicting end-of-week overtime risks per site.</p>
                </div>
                <span class="text-xs font-mono bg-white/10 px-2 py-1 rounded text-white/60">Model</span>
             </div>
          </div>
        </div>

      </div>
    </main>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Inter:wght@300;400;500;600;700&display=swap');

.font-sans {
 font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
}
.font-mono {
 font-family: 'Fira Code', ui-monospace, SFMono-Regular, monospace;
}
</style>