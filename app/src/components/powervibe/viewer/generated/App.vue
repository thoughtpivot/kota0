<script setup lang="ts">
import { powervibeBundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";
import { ref, onMounted, computed } from "vue";
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';
import { BuildingOfficeIcon, UserGroupIcon, CodeBracketIcon, PlusIcon, ChatBubbleLeftRightIcon, SparklesIcon } from "@heroicons/vue/24/outline";

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const companies = ref<any[]>([]);
const deals = ref<any[]>([]);
const contacts = ref<any[]>([]);

// Form states
const newCompany = ref({ name: "", industry: "", status: "Lead" });
const newContact = ref({ name: "", email: "", companyId: "" });

const chartData = computed(() => ({
  labels: ['Prospecting', 'Negotiation', 'Closed Won'],
  datasets: [{ 
    label: 'Deal Value ($)', 
    backgroundColor: '#3b82f6',
    data: [12000, 45000, 89000] 
  }]
}));

async function loadData() {
  const [cRes, dRes, ctRes] = await Promise.all([
    fetch(powervibeBundleApiUrl("api/powervibe-app/crm/companies")),
    fetch(powervibeBundleApiUrl("api/powervibe-app/crm/deals")),
    fetch(powervibeBundleApiUrl("api/powervibe-app/crm/contacts"))
  ]);
  companies.value = await cRes.json();
  deals.value = await dRes.json();
  contacts.value = await ctRes.json();
}

async function addCompany() {
  await fetch(powervibeBundleApiUrl("api/powervibe-app/crm/companies"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newCompany.value)
  });
  newCompany.value = { name: "", industry: "", status: "Lead" };
  loadData();
}

async function addContact() {
  await fetch(powervibeBundleApiUrl("api/powervibe-app/crm/contacts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newContact.value)
  });
  newContact.value = { name: "", email: "", companyId: "" };
  loadData();
}

onMounted(loadData);
</script>

<template>
  <div class="min-h-screen bg-neutral-50 p-8 text-neutral-900">
    <header class="mb-8 flex items-center gap-6">
      <img src="https://www.thoughtpivot.com/tp.svg" alt="ThoughtPivot Logo" class="w-48 h-48" />
      <div>
        <h1 class="text-neutral-500 text-lg">Overview of client relationships and sales performance.</h1>
      </div>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <div class="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 class="mb-4 font-semibold text-lg">Sales Pipeline</h2>
          <Bar :data="chartData" :options="{ responsive: true }" />
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h3 class="mb-4 font-semibold flex items-center gap-2"><PlusIcon class="w-4 h-4"/> Add Company</h3>
            <input v-model="newCompany.name" placeholder="Name" class="w-full mb-2 p-2 border rounded text-sm" />
            <input v-model="newCompany.industry" placeholder="Industry" class="w-full mb-2 p-2 border rounded text-sm" />
            <button @click="addCompany" class="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium">Create Company</button>
          </div>
          <div class="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h3 class="mb-4 font-semibold flex items-center gap-2"><PlusIcon class="w-4 h-4"/> Add Contact</h3>
            <input v-model="newContact.name" placeholder="Name" class="w-full mb-2 p-2 border rounded text-sm" />
            <input v-model="newContact.email" placeholder="Email" class="w-full mb-2 p-2 border rounded text-sm" />
            <button @click="addContact" class="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium">Create Contact</button>
          </div>
        </div>
      </div>

      <div class="space-y-6">
        <div class="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 class="mb-4 font-semibold text-lg flex items-center gap-2">
            <BuildingOfficeIcon class="w-5 h-5" /> Recent Companies
          </h2>
          <ul class="space-y-3">
            <li v-for="c in companies.slice(0, 5)" :key="c.id" class="text-sm p-2 bg-neutral-50 rounded">
              {{ c.data.name }} — <span class="text-neutral-400 text-xs">{{ c.data.industry }}</span>
            </li>
          </ul>
        </div>
        
        <div class="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 class="mb-4 font-semibold text-lg flex items-center gap-2">
            <CodeBracketIcon class="w-5 h-5" /> MCP Tooling
          </h2>
          <code class="block bg-neutral-900 text-white p-3 rounded text-[10px] overflow-x-auto">
            list-companies() <br>
            create-company({name, industry, status}) <br>
            create-contact({name, email, companyId})
          </code>
        </div>

        <div class="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 class="mb-4 font-semibold text-lg flex items-center gap-2">
            <SparklesIcon class="w-5 h-5" /> AI Data API
          </h2>
          <div class="text-[10px] space-y-4">
            <div class="flex items-center gap-2 text-neutral-600 italic">
              <ChatBubbleLeftRightIcon class="w-4 h-4" /> 
              POST /api/powervibe-app/ai/chat
            </div>
            <p class="text-neutral-500">
              Query our CRM with natural language. We utilize BM25 relevance sorting to inject the 5 most pertinent records from companies, contacts, and deals as context for the AI.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>