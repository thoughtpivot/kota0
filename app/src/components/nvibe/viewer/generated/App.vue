<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { 
  ArrowRight, 
  Clock, 
  ShieldCheck, 
  HardHat,
  ChevronRight,
  TrendingUp,
  MapPin
} from 'lucide-vue-next';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const isScrolled = ref(false);

const handleScroll = () => {
  isScrolled.value = window.scrollY > 20;
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
    
    <nav :class="['fixed top-0 w-full z-50 transition-all duration-300 border-b', isScrolled ? 'bg-white/80 backdrop-blur-lg border-slate-200 py-4 shadow-sm' : 'bg-transparent border-transparent py-6']">
      <div class="container mx-auto px-6 flex justify-between items-center">
        <div class="flex items-center gap-2">
          <HardHat class="w-7 h-7 text-indigo-900" />
          <span class="font-bold text-xl tracking-tight">Mateo<span class="text-slate-500 font-light">Equipment</span></span>
        </div>
        <div class="hidden md:flex gap-8 font-medium text-sm text-slate-600">
          <a href="#inventory" class="hover:text-indigo-900 transition-colors">Fleet Inventory</a>
          <a href="#" class="hover:text-indigo-900 transition-colors">Logistics</a>
          <a href="#" class="hover:text-indigo-900 transition-colors">Case Studies</a>
        </div>
        <button class="px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-full hover:bg-indigo-900 transition-all">
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
          <div class="flex gap-4">
            <button class="flex items-center gap-2 px-8 py-4 bg-indigo-900 text-white rounded-xl font-bold hover:bg-indigo-800 transition-all shadow-xl shadow-indigo-200">
              Browse Inventory <ArrowRight class="w-5 h-5" />
            </button>
            <button class="px-8 py-4 bg-white border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors">
              Our Capabilities
            </button>
          </div>
        </div>
      </div>
    </header>

    <section id="inventory" class="py-24 bg-white">
      <div class="container mx-auto px-6">
        <div class="flex justify-between items-end mb-12">
          <div>
            <h2 class="text-4xl font-bold mb-2">Available Fleet</h2>
            <p class="text-slate-500">Industry-leading assets maintained to factory standards.</p>
          </div>
          <button class="text-indigo-900 font-bold flex items-center gap-1 hover:underline">
            View All Assets <ChevronRight class="w-4 h-4" />
          </button>
        </div>

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

    <footer class="py-24 bg-slate-900 text-slate-400">
      <div class="container mx-auto px-6 grid md:grid-cols-4 gap-12">
        <div class="col-span-2">
          <div class="flex items-center gap-2 mb-6">
            <HardHat class="w-8 h-8 text-white" />
            <span class="font-bold text-2xl text-white tracking-tight">Mateo Equipment</span>
          </div>
          <p class="max-w-xs">Building the foundations of tomorrow with reliable logistics today.</p>
        </div>
        <div>
          <h4 class="text-white font-bold mb-4">Support</h4>
          <ul class="space-y-2">
            <li><a href="#" class="hover:text-white">Maintenance</a></li>
            <li><a href="#" class="hover:text-white">Fleet Specs</a></li>
            <li><a href="#" class="hover:text-white">Site Safety</a></li>
          </ul>
        </div>
        <div>
          <h4 class="text-white font-bold mb-4">Contact</h4>
          <p class="text-sm">dispatch@mateo-equip.com</p>
          <p class="text-sm">+1 (555) 900-4400</p>
        </div>
      </div>
    </footer>
  </div>
</template>