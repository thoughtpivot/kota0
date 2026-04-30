<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { 
  ArrowRight, 
  HardHat,
  ChevronRight
} from 'lucide-vue-next';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const isScrolled = ref(false);
const toast = ref<{ visible: boolean; message: string }>({ visible: false, message: '' });

const handleScroll = () => {
  isScrolled.value = window.scrollY > 20;
};

const showToast = async () => {
  try {
    const response = await fetch(new URL('api/nvibe-app/config', document.baseURI).href);
    const data = await response.json();
    toast.value = { visible: true, message: `System Secret: ${data.value}` };
    setTimeout(() => { toast.value.visible = false; }, 3000);
  } catch (e) {
    console.error('Failed to fetch config', e);
  }
};

onMounted(() => {
  window.addEventListener('scroll', handleScroll);
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});

const equipmentItems = [
  {
    id: 1,
    name: 'Atlas V-12 Crane',
    description: 'Precision-engineered lifting capacity for high-rise steel frame assembly.',
    price: '$850 / day',
    image: 'https://images.unsplash.com/photo-1541972064-53093282245e?auto=format&fit=crop&q=80&w=1200',
    tags: ['Heavy Lift']
  },
  {
    id: 2,
    name: 'Terra-Max Loader',
    description: 'Hydrostatic all-terrain drive for rapid excavation and site prep.',
    price: '$420 / day',
    image: 'https://images.unsplash.com/photo-1590674899484-d56419827050?auto=format&fit=crop&q=80&w=1200',
    tags: ['Earthmoving']
  },
  {
    id: 3,
    name: 'Apex Site Command',
    description: 'Autonomous, climate-controlled modular center for remote site operations.',
    price: '$150 / day',
    image: 'https://images.unsplash.com/photo-1503387762-592dea580dae?auto=format&fit=crop&q=80&w=1200',
    tags: ['Logistics']
  }
];
</script>

<template>
  <div class="min-h-screen bg-stone-50 text-slate-900 font-sans">
    <div v-if="toast.visible" class="fixed bottom-6 right-6 bg-slate-900 text-white px-6 py-3 rounded-lg shadow-xl z-[60] animate-in slide-in-from-bottom-4">
      {{ toast.message }}
    </div>

    <nav :class="['fixed top-0 w-full z-50 transition-all duration-300 border-b', isScrolled ? 'bg-white/80 backdrop-blur-lg border-slate-200 py-4 shadow-sm' : 'bg-transparent border-transparent py-6']">
      <div class="container mx-auto px-6 flex justify-between items-center">
        <div class="flex items-center gap-2">
          <HardHat class="w-7 h-7 text-indigo-900" />
          <span class="font-bold text-xl tracking-tight">Mateo<span class="text-slate-500 font-light">Equipment</span></span>
        </div>
        <button @click="showToast" class="px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-full hover:bg-indigo-900 transition-all">
          Request Quote
        </button>
      </div>
    </nav>

    <header class="pt-40 pb-24 px-6">
      <div class="container mx-auto max-w-6xl">
        <div class="max-w-3xl">
          <span class="inline-block py-1 px-3 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-widest mb-6 border border-indigo-100">
            Precision Fleet Logistics
          </span>
          <h1 class="text-6xl md:text-8xl font-extrabold tracking-tighter mb-8 text-slate-900 leading-[0.9]">
            Heavy duty. <br/> <span class="text-slate-400">High efficiency.</span>
          </h1>
          <p class="text-xl text-slate-600 mb-10 max-w-lg leading-relaxed">
            We provide mission-critical industrial hardware to major construction projects with 24/7 site support and rapid deployment.
          </p>
        </div>
      </div>
    </header>

    <section id="inventory" class="py-24 bg-white">
      <div class="container mx-auto px-6">
        <div class="grid md:grid-cols-3 gap-8">
          <div v-for="item in equipmentItems" :key="item.id" class="group bg-slate-50 rounded-3xl p-2 border border-slate-100 hover:border-indigo-200 transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-50/50">
            <div class="aspect-[4/3] rounded-2xl overflow-hidden mb-6">
              <img :src="item.image" :alt="item.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
            </div>
            <div class="px-4 pb-4">
              <div class="flex justify-between items-start mb-4">
                <h3 class="text-2xl font-bold">{{ item.name }}</h3>
                <span class="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">{{ item.tags[0] }}</span>
              </div>
              <p class="text-slate-600 text-sm mb-6">{{ item.description }}</p>
              <div class="flex items-center justify-between">
                <span class="text-lg font-bold">{{ item.price }}</span>
                <button class="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-indigo-900 transition-colors">
                  <ArrowRight class="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>