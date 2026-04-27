<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Search, 
  Filter, 
  AlertTriangle, 
  Server, 
  Database, 
  Activity, 
  Cpu, 
  X,
  ArrowUpRight,
  ShieldAlert,
  CreditCard
} from 'lucide-vue-next';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement
} from 'chart.js';
import { Doughnut, Bar } from 'vue-chartjs';
import { Dialog, DialogPanel, TransitionChild, TransitionRoot } from '@headlessui/vue';

// Register Chart.js components
ChartJS.register(Title, Tooltip, Legend, ArcElement, CategoryScale, LinearScale, BarElement);

// --- Types ---
type Provider = 'aws' | 'gcp' | 'azure';
type ResourceType = 'Machine' | 'Bucket' | 'Function' | 'Network';

interface Resource {
  id: string;
  name: string;
  provider: Provider;
  type: ResourceType;
  region: string;
  status: 'running' | 'stopped' | 'degraded';
  cost: number;
  tags: string[];
  rawDetails: Record<string, string>;
}

// --- Mock Data ---
const resources = ref<Resource[]>([
  {
    id: "i-0a1b2c3d4e5f6g",
    name: "prod-api-gateway",
    provider: 'aws',
    type: 'Machine',
    region: "us-east-1",
    status: 'running',
    cost: 145.20,
    tags: ['Env:Prod', 'Tier:1'],
    rawDetails: { arn: "arn:aws:ec2:us-east-1:123456789012:instance/i-0a1b2c3d4e5f6g", vpc: "vpc-9982x", type: "t3.xlarge" }
  },
  {
    id: "gcp-vm-edge-node",
    name: "edge-compute-01",
    provider: 'gcp',
    type: 'Machine',
    region: "europe-west1",
    status: 'running',
    cost: 89.50,
    tags: ['Edge', 'Latency-Optimized'],
    rawDetails: { selfLink: "https://www.googleapis.com/compute/v1/projects/omni-cloud/zones/europe-west1-b/instances/edge-01", machineType: "n2-standard-4" }
  },
  {
    id: "az-storage-media",
    name: "media-assets-static",
    provider: 'azure',
    type: 'Bucket',
    region: "West US 2",
    status: 'running',
    cost: 412.00,
    tags: ['Storage', 'CDN'],
    rawDetails: { resourceId: "/subscriptions/xxx-yyy/resourceGroups/rg-media/providers/Microsoft.Storage/storageAccounts/media-assets-static", tier: "Hot" }
  },
  {
    id: "aws-lambda-auth",
    name: "identity-verifier",
    provider: 'aws',
    type: 'Function',
    region: "us-west-2",
    status: 'running',
    cost: 12.40,
    tags: ['Serverless', 'Security'],
    rawDetails: { functionArn: "arn:aws:lambda:us-west-2:123456789012:function:identity-verifier", memory: "512MB" }
  },
  {
    id: "gcp-sql-main",
    name: "customer-db-primary",
    provider: 'gcp',
    type: 'Bucket',
    region: "us-central1",
    status: 'degraded',
    cost: 850.00,
    tags: ['Critical', 'Database'],
    rawDetails: { instanceId: "omni-cloud:us-central1:customer-db", storageType: "SSD" }
  },
  {
    id: "az-vnet-core",
    name: "global-vnet-backbone",
    provider: 'azure',
    type: 'Network',
    region: "East US",
    status: 'running',
    cost: 210.00,
    tags: ['Networking', 'Core'],
    rawDetails: { vnetId: "/subscriptions/xxx/resourceGroups/core/providers/Microsoft.Network/virtualNetworks/global-vnet", addressSpace: "10.0.0.0/16" }
  },
  {
    id: "aws-s3-cold-storage",
    name: "archive-glacier-01",
    provider: 'aws',
    type: 'Bucket',
    region: "us-west-1",
    status: 'running',
    cost: 24.00,
    tags: ['Archive', 'Compliance'],
    rawDetails: { bucketArn: "arn:aws:s3:::archive-glacier-01", storageClass: "GLACIER" }
  },
  {
    id: "gcp-run-analytics",
    name: "analytics-processor",
    provider: 'gcp',
    type: 'Function',
    region: "us-east4",
    status: 'running', 
    cost: 45.10,
    tags: ['Data', 'Realtime'],
    rawDetails: { serviceId: "projects/omni/locations/us-east4/services/analytics-processor", minInstances: "1" }
  },
  {
    id: "az-vm-internal-hr",
    name: "hr-portal-vm",
    provider: 'azure',
    type: 'Machine',
    region: "Central US",
    status: 'stopped',
    cost: 120.00,
    tags: ['Internal', 'Legacy'],
    rawDetails: { vmId: "/subscriptions/xxx/resourceGroups/hr/providers/Microsoft.Compute/virtualMachines/hr-portal", size: "Standard_D2s_v3" }
  },
  {
    id: "aws-rds-replica",
    name: "db-readonly-01",
    provider: 'aws',
    type: 'Machine',
    region: "ap-southeast-1",
    status: 'running',
    cost: 310.00,
    tags: ['Database', 'Read-Replica'],
    rawDetails: { dbInstanceArn: "arn:aws:rds:ap-southeast-1:123456789012:db:db-readonly-01", engine: "postgres-15" }
  },
  {
    id: "gcp-vpc-main",
    name: "omni-vpc-core",
    provider: 'gcp',
    type: 'Network',
    region: "global",
    status: 'running',
    cost: 45.00,
    tags: ['Network', 'Backbone'],
    rawDetails: { selfLink: "https://www.googleapis.com/compute/v1/projects/omni/global/networks/omni-vpc-core", mtu: "1460" }
  },
  {
    id: "az-blob-logs",
    name: "security-audit-logs",
    provider: 'azure',
    type: 'Bucket',
    region: "West Europe",
    status: 'running',
    cost: 65.00,
    tags: ['Security', 'Audit'],
    rawDetails: { storageAccountId: "/subscriptions/xxx/resourceGroups/sec/providers/Microsoft.Storage/storageAccounts/seclogs", accessTier: "Cool" }
  }
]);

const alerts = [
  { id: 1, severity: 'critical', title: 'Public Bucket Detected', provider: 'aws', msg: 'S3 bucket "legacy-logs" is set to public read access.' },
  { id: 2, severity: 'warning', title: 'Orphaned Resource', provider: 'azure', msg: 'Disk "temp-buffer-09" has been unattached for 14 days.' },
  { id: 3, severity: 'info', title: 'Auto-Scaling Event', provider: 'gcp', msg: 'Compute Engine "api-v3" scaled to 12 instances.' }
];

// --- State & Filtering ---
const searchQuery = ref('');
const filterProvider = ref<Provider | 'all'>('all');
const selectedResource = ref<Resource | null>(null);
const isSlideOverOpen = ref(false);

const filteredResources = computed(() => {
  return resources.value.filter(res => {
    const matchesSearch = res.name.toLowerCase().includes(searchQuery.value.toLowerCase()) || 
                         res.id.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
                         res.region.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchesProvider = filterProvider.value === 'all' || res.provider === filterProvider.value;
    return matchesSearch && matchesProvider;
  });
});

const totalBurn = computed(() => resources.value.reduce((acc, r) => acc + r.cost, 0).toFixed(2));

const openDetails = (res: Resource) => {
  selectedResource.value = res;
  isSlideOverOpen.value = true;
};

// --- Chart Data ---
const donutData = {
  labels: ['AWS', 'GCP', 'Azure'],
  datasets: [{
    data: [540, 320, 280],
    backgroundColor: ['#f59e0b', '#4285f4', '#00a4ef'],
    borderWidth: 0,
    hoverOffset: 4
  }]
};

const donutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' as const, labels: { color: '#94a3b8', font: { family: 'Inter' } } }
  }
};

const barData = {
  labels: ['Machines', 'Buckets', 'Functions', 'Networks'],
  datasets: [{
    label: 'Count',
    data: [18, 12, 10, 5],
    backgroundColor: '#3b82f6',
    borderRadius: 4
  }]
};

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } },
    x: { grid: { display: false }, ticks: { color: '#64748b' } }
  },
  plugins: {
    legend: { display: false }
  }
};
</script>

<template>
  <div class="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-blue-500/30">
    
    <!-- Header / Posture Bar -->
    <header class="border-b border-slate-800 bg-[#020617]/80 backdrop-blur-xl sticky top-0 z-40">
      <div class="max-w-[1600px] mx-auto px-6 h-20 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
            <Activity class="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 class="text-xl font-bold tracking-tight text-white">Omni-Cloud</h1>
            <p class="text-xs text-slate-500 font-mono">v4.2.0 // Unified_Infrastructure</p>
          </div>
        </div>

        <div class="flex items-center gap-12">
          <div class="text-right">
            <p class="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Global Burn Rate</p>
            <p class="text-2xl font-bold text-white">${{ totalBurn }}<span class="text-sm text-slate-400 font-normal">/hr</span></p>
          </div>
          <div class="text-right">
            <p class="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Asset Posture</p>
            <p class="text-2xl font-bold text-white">{{ resources.length }} <span class="text-xs text-emerald-500 font-medium">Live</span></p>
          </div>
          <div class="h-10 w-[1px] bg-slate-800"></div>
          <button class="btn btn-circle btn-ghost">
            <div class="indicator">
              <ShieldAlert class="w-5 h-5" />
              <span class="badge badge-xs badge-error indicator-item"></span>
            </div>
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-[1600px] mx-auto p-6">
      
      <!-- Bento Grid Layout -->
      <div class="grid grid-cols-12 gap-6">
        
        <!-- Financial Pulse (Donut) -->
        <div class="col-span-12 lg:col-span-3 card bg-slate-900/40 border border-slate-800/60 p-6 backdrop-blur-sm">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-sm font-semibold text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <CreditCard class="w-4 h-4 text-blue-500" /> 
              Spend by Provider
            </h2>
          </div>
          <div class="h-48">
            <Doughnut :data="donutData" :options="donutOptions" />
          </div>
        </div>

        <!-- Resource Distribution (Bar) -->
        <div class="col-span-12 lg:col-span-5 card bg-slate-900/40 border border-slate-800/60 p-6 backdrop-blur-sm">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-sm font-semibold text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <Cpu class="w-4 h-4 text-blue-500" />
              Asset Distribution
            </h2>
            <span class="text-[10px] text-slate-500 font-mono uppercase">Updated Realtime</span>
          </div>
          <div class="h-48">
            <Bar :data="barData" :options="barOptions" />
          </div>
        </div>

        <!-- Security Sync (Alerts) -->
        <div class="col-span-12 lg:col-span-4 card bg-slate-900/40 border border-slate-800/60 p-6 backdrop-blur-sm">
          <h2 class="text-sm font-semibold text-slate-300 uppercase tracking-widest flex items-center gap-2 mb-4">
            <ShieldAlert class="w-4 h-4 text-rose-500" />
            Security Sync
          </h2>
          <div class="space-y-3">
            <div v-for="alert in alerts" :key="alert.id" 
              class="flex gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
              <div :class="{
                'text-rose-500': alert.severity === 'critical',
                'text-amber-500': alert.severity === 'warning',
                'text-blue-500': alert.severity === 'info'
              }">
                <AlertTriangle class="w-5 h-5" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <p class="text-xs font-bold">{{ alert.title }}</p>
                  <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 uppercase font-mono">{{ alert.provider }}</span>
                </div>
                <p class="text-[11px] text-slate-400 mt-1">{{ alert.msg }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Unified Mesh (Grid View) -->
        <div class="col-span-12 space-y-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <div class="join bg-slate-900 border border-slate-800">
                <button 
                  v-for="p in ['all', 'aws', 'gcp', 'azure']" 
                  :key="p" 
                  @click="filterProvider = p as any"
                  :class="['join-item btn btn-sm border-none font-bold uppercase text-[10px]', filterProvider === p ? 'bg-blue-600 text-white' : 'bg-transparent text-slate-400 hover:text-white']"
                >
                  {{ p }}
                </button>
              </div>
            </div>

            <div class="relative flex-1 max-w-md">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                v-model="searchQuery" 
                type="text" 
                placeholder="Search by name, region, or ID..."
                class="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <!-- Resource Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            <div 
              v-for="res in filteredResources" 
              :key="res.id" 
              @click="openDetails(res)"
              class="group relative bg-slate-900/40 border border-slate-800/60 p-5 rounded-xl hover:bg-slate-900/80 transition-all cursor-pointer overflow-hidden"
              :class="{
                'border-l-4 border-l-amber-500': res.provider === 'aws',
                'border-l-4 border-l-blue-500': res.provider === 'gcp',
                'border-l-4 border-l-sky-500': res.provider === 'azure'
              }"
            >
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                    <component :is="res.type === 'Machine' ? Server : res.type === 'Bucket' ? Database : res.type === 'Function' ? Cpu : Activity" class="w-5 h-5 text-slate-300" />
                  </div>
                  <div>
                    <h3 class="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{{ res.name }}</h3>
                    <p class="text-xs font-mono text-slate-500">{{ res.id }}</p>
                  </div>
                </div>
                <div class="flex flex-col items-end">
                  <span :class="[
                    'text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider',
                    res.status === 'running' ? 'bg-emerald-500/10 text-emerald-400' : 
                    res.status === 'stopped' ? 'bg-slate-500/10 text-slate-400' : 'bg-rose-500/10 text-rose-400'
                  ]">
                    {{ res.status }}
                  </span>
                  <p class="text-xs font-mono mt-1 text-slate-400">{{ res.region }}</p>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap gap-1">
                <span v-for="tag in res.tags" :key="tag" class="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                  {{ tag }}
                </span>
              </div>

              <div class="mt-4 flex items-center justify-between border-t border-slate-800/50 pt-4">
                <div class="flex items-center gap-1.5">
                  <!-- SVG Icons for Clouds -->
                  <svg v-if="res.provider === 'aws'" viewBox="0 0 24 24" class="w-4 h-4 fill-amber-500"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
                  <svg v-if="res.provider === 'gcp'" viewBox="0 0 24 24" class="w-4 h-4 fill-blue-500"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  <svg v-if="res.provider === 'azure'" viewBox="0 0 24 24" class="w-4 h-4 fill-sky-500"><path d="M12 2L2 19h20L12 2zm0 3l7.5 13h-15L12 5z"/></svg>
                  <span class="text-[10px] font-bold text-slate-400 uppercase">{{ res.provider }} // {{ res.type }}</span>
                </div>
                <p class="text-sm font-bold text-white">${{ res.cost.toFixed(2) }}<span class="text-[10px] text-slate-500">/mo</span></p>
              </div>
              
              <ArrowUpRight class="absolute bottom-2 right-2 w-3 h-3 text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>

      </div>
    </main>

    <!-- Metadata Slide-over -->
    <TransitionRoot as="template" :show="isSlideOverOpen">
      <Dialog as="div" class="relative z-50" @close="isSlideOverOpen = false">
        <TransitionChild as="template" enter="ease-in-out duration-500" enter-from="opacity-0" enter-to="opacity-100" leave="ease-in-out duration-500" leave-from="opacity-100" leave-to="opacity-0">
          <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" />
        </TransitionChild>

        <div class="fixed inset-0 overflow-hidden">
          <div class="absolute inset-0 overflow-hidden">
            <div class="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <TransitionChild as="template" enter="transform transition ease-in-out duration-500 sm:duration-700" enter-from="translate-x-full" enter-to="translate-x-0" leave="transform transition ease-in-out duration-500 sm:duration-700" leave-from="translate-x-0" leave-to="translate-x-full">
                <DialogPanel class="pointer-events-auto w-screen max-w-md">
                  <div class="flex h-full flex-col overflow-y-scroll bg-[#020617] border-l border-slate-800 shadow-2xl">
                    <div class="px-6 py-8">
                      <div class="flex items-start justify-between">
                        <h2 class="text-lg font-bold text-white uppercase tracking-tight">Infrastructure Details</h2>
                        <div class="ml-3 flex h-7 items-center">
                          <button type="button" class="rounded-md text-slate-500 hover:text-white" @click="isSlideOverOpen = false">
                            <X class="h-6 w-6" />
                          </button>
                        </div>
                      </div>

                      <div v-if="selectedResource" class="mt-10 space-y-8">
                        <!-- Identity Card -->
                        <div class="p-4 rounded-xl bg-slate-900 border border-slate-800">
                           <div class="flex items-center gap-4 mb-4">
                             <div class="w-12 h-12 bg-blue-600/20 text-blue-400 rounded-lg flex items-center justify-center font-bold">
                               {{ selectedResource.provider.toUpperCase() }}
                             </div>
                             <div>
                               <h4 class="font-bold text-lg">{{ selectedResource.name }}</h4>
                               <p class="text-xs text-slate-400 font-mono">{{ selectedResource.id }}</p>
                             </div>
                           </div>
                           <div class="grid grid-cols-2 gap-4 text-xs">
                             <div class="bg-slate-950 p-2 rounded">
                               <p class="text-slate-500 mb-1">Type</p>
                               <p class="font-bold">{{ selectedResource.type }}</p>
                             </div>
                             <div class="bg-slate-950 p-2 rounded">
                               <p class="text-slate-500 mb-1">Region</p>
                               <p class="font-bold">{{ selectedResource.region }}</p>
                             </div>
                           </div>
                        </div>

                        <!-- Provider Specifics -->
                        <div>
                          <h5 class="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-3">Raw Provider Metadata</h5>
                          <div class="space-y-4">
                            <div v-for="(val, key) in selectedResource.rawDetails" :key="key" class="bg-slate-900/50 p-3 rounded-lg border border-slate-800/50">
                              <p class="text-[9px] font-mono text-blue-500 uppercase font-bold mb-1">{{ key }}</p>
                              <p class="text-[11px] font-mono text-slate-300 break-all select-all">{{ val }}</p>
                            </div>
                          </div>
                        </div>

                        <!-- Mock Graph / History -->
                        <div class="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                           <p class="text-[10px] font-bold text-emerald-500 uppercase mb-2 flex items-center gap-2">
                             <Activity class="w-3 h-3" /> Health Pulse (24h)
                           </p>
                           <div class="h-12 w-full flex items-end gap-1 px-1">
                             <div v-for="i in 20" :key="i" class="flex-1 bg-emerald-500/40 rounded-t-sm" :style="{ height: (40 + Math.random() * 60) + '%' }"></div>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </div>
      </Dialog>
    </TransitionRoot>

  </div>
</template>

<style>
body {
 background-color: #020617;
}

.font-mono {
 font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
}

::selection {
 background: rgba(59, 130, 246, 0.3);
 color: white;
}
</style>