<script setup lang="ts">
import { ref } from 'vue';
import { Line, Doughnut } from 'vue-chartjs';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend,
  ArcElement
} from 'chart.js';
import { MapPin, ShieldCheck, Phone, DollarSign, CalendarDays, X, Loader2, LogIn } from 'lucide-vue-next';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

const showModal = ref(false);
const modalMode = ref<'login' | 'register'>('register');
const isSubmitting = ref(false);
const clientForm = ref({ name: '', email: '', propertyType: 'Residential' });
const loginForm = ref({ email: '', password: '' });

const openModal = (mode: 'login' | 'register') => {
  modalMode.value = mode;
  showModal.value = true;
};

const lineData = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  datasets: [{
    label: 'Miami Job Inquiries',
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
    data: [12, 19, 15, 22, 28, 35, 30]
  }]
};

const pieData = {
  labels: ['Residential', 'Commercial', 'Repairs'],
  datasets: [{
    backgroundColor: ['#3b82f6', '#1e40af', '#60a5fa'],
    data: [65, 20, 15]
  }]
};

const jobs = [
  { id: 'MIA-882', client: 'Ocean Dr. Condo', status: 'In Progress', progress: 75 },
  { id: 'MIA-901', client: 'Coral Gables Estate', status: 'Pending', progress: 10 },
  { id: 'MIA-774', client: 'Brickell Retail', status: 'Completed', progress: 100 }
];

async function submitAction() {
  isSubmitting.value = true;
  const endpoint = modalMode.value === 'login' ? '/api/nvibe-app/login' : '/api/nvibe-app/register-client';
  const data = modalMode.value === 'login' ? loginForm.value : clientForm.value;
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      showModal.value = false;
    }
  } catch (err) {
    console.error('Action failed:', err);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">
    <header class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Miami Roofing Pro</h1>
        <p class="text-slate-500">Metro Operations Command Center</p>
      </div>
      <div class="flex gap-3">
        <button @click="openModal('login')" class="btn btn-outline border-slate-300">
          <LogIn class="w-4 h-4 mr-2" /> Login
        </button>
        <button @click="openModal('register')" class="btn btn-primary shadow-lg">New Inspection</button>
      </div>
    </header>

    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div class="card w-full max-w-md bg-white p-6 shadow-xl animate-in fade-in zoom-in duration-200">
        <div class="flex justify-between mb-4">
          <h2 class="text-xl font-bold">{{ modalMode === 'login' ? 'Staff Login' : 'New Client Intake' }}</h2>
          <button @click="showModal = false"><X class="w-5 h-5 text-slate-400" /></button>
        </div>
        <form @submit.prevent="submitAction" class="space-y-4">
          <template v-if="modalMode === 'register'">
            <input v-model="clientForm.name" placeholder="Client Name" class="input input-bordered w-full" required />
            <input v-model="clientForm.email" type="email" placeholder="Email Address" class="input input-bordered w-full" required />
            <select v-model="clientForm.propertyType" class="select select-bordered w-full">
              <option>Residential</option>
              <option>Commercial</option>
            </select>
          </template>
          <template v-else>
            <input v-model="loginForm.email" type="email" placeholder="Staff Email" class="input input-bordered w-full" required />
            <input v-model="loginForm.password" type="password" placeholder="Password" class="input input-bordered w-full" required />
          </template>
          <button type="submit" :disabled="isSubmitting" class="btn btn-primary w-full">
            <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
            {{ isSubmitting ? 'Processing...' : (modalMode === 'login' ? 'Sign In' : 'Register Client') }}
          </button>
        </form>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="card bg-white p-6 shadow-sm border border-slate-200">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-blue-100 rounded-lg text-blue-600"><DollarSign /></div>
          <div>
            <p class="text-sm text-slate-500">Q2 Revenue</p>
            <p class="text-2xl font-bold">$142,500</p>
          </div>
        </div>
      </div>
      <div class="card bg-white p-6 shadow-sm border border-slate-200">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-emerald-100 rounded-lg text-emerald-600"><ShieldCheck /></div>
          <div>
            <p class="text-sm text-slate-500">Active Permits</p>
            <p class="text-2xl font-bold">12</p>
          </div>
        </div>
      </div>
      <div class="card bg-white p-6 shadow-sm border border-slate-200">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-purple-100 rounded-lg text-purple-600"><CalendarDays /></div>
          <div>
            <p class="text-sm text-slate-500">Upcoming Jobs</p>
            <p class="text-2xl font-bold">8</p>
          </div>
        </div>
      </div>

      <div class="card bg-white p-6 shadow-sm border border-slate-200 lg:col-span-2">
        <h2 class="mb-4 font-semibold">Weekly Lead Volume</h2>
        <Line :data="lineData" :options="{ responsive: true }" />
      </div>

      <div class="card bg-white p-6 shadow-sm border border-slate-200">
        <h2 class="mb-4 font-semibold">Project Distribution</h2>
        <Doughnut :data="pieData" />
      </div>

      <div class="card bg-white p-6 shadow-sm border border-slate-200 lg:col-span-3">
        <h2 class="mb-4 font-semibold">Active Miami Metro Sites</h2>
        <table class="table w-full">
          <thead><tr><th>ID</th><th>Client</th><th>Status</th><th>Progress</th></tr></thead>
          <tbody>
            <tr v-for="job in jobs" :key="job.id">
              <td class="font-mono text-sm">{{ job.id }}</td>
              <td>{{ job.client }}</td>
              <td><span class="badge" :class="job.status === 'Completed' ? 'badge-success' : 'badge-warning'">{{ job.status }}</span></td>
              <td><progress class="progress progress-primary w-24" :value="job.progress" max="100"></progress></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>