<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { 
  ChefHat, 
  Truck, 
  UtensilsCrossed, 
  Star, 
  ArrowRight, 
  MapPin, 
  Clock, 
  Flame
} from 'lucide-vue-next';
import { Doughnut } from 'vue-chartjs';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// Register Chart.js elements
ChartJS.register(ArcElement, Tooltip, Legend);

// State for sticky navbar
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

// Macro Data for Featured Dish
const macroData = {
  labels: ['Protein (45g)', 'Carbs (35g)', 'Fats (22g)'],
  datasets: [
    {
      data: [45, 35, 22],
      backgroundColor: ['#ea580c', '#fcd34d', '#78716c'],
      borderWidth: 0,
      hoverOffset: 4
    }
  ]
};

const macroOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '75%',
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      callbacks: {
        label: function(context: any) {
          return ` ${context.label}`;
        }
      }
    }
  }
};

// Mock Menu Data
const menuItems = [
  {
    id: 1,
    name: 'Seared King Salmon',
    description: 'Wild-caught salmon over a bed of quinoa, roasted asparagus, and a lemon-dill beurre blanc.',
    price: '$28',
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&q=80&w=800',
    tags: ['Gluten-Free', 'High Protein']
  },
  {
    id: 2,
    name: 'Braised Short Rib Pappardelle',
    description: 'Slow-cooked beef short rib ragù tossed with fresh, hand-cut egg pasta and aged parmesan.',
    price: '$26',
    image: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&q=80&w=800',
    tags: ['House Favorite']
  },
  {
    id: 3,
    name: 'Wild Mushroom Risotto',
    description: 'Arborio rice simmered in mushroom broth, finished with truffle oil, porcini powder, and herbs.',
    price: '$22',
    image: 'https://images.unsplash.com/photo-1633337474564-1d9e26214742?auto=format&fit=crop&q=80&w=800',
    tags: ['Vegetarian']
  }
];
</script>

<template>
  <div class="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-orange-200 selection:text-orange-900 dark:bg-stone-950 dark:text-stone-50 dark:selection:bg-orange-900 dark:selection:text-orange-50">
    
    <!-- Navigation -->
    <nav 
      :class="[
        'fixed top-0 w-full z-50 transition-all duration-300 border-b',
        isScrolled ? 'bg-white/90 backdrop-blur-md border-stone-200 py-3 shadow-sm dark:bg-stone-950/90 dark:border-stone-800' : 'bg-transparent border-transparent py-5'
      ]"
    >
      <div class="container mx-auto px-6 flex justify-between items-center">
        <div class="flex items-center gap-2">
          <ChefHat class="w-7 h-7 text-orange-600" stroke-width="1.5" />
          <span class="font-serif text-xl font-bold tracking-tight">Mateo<span class="text-orange-600">Direct</span></span>
        </div>
        <div class="hidden md:flex gap-8 font-medium text-sm text-stone-600 dark:text-stone-400">
          <a href="#how-it-works" class="hover:text-orange-600 transition-colors">How It Works</a>
          <a href="#menu" class="hover:text-orange-600 transition-colors">This Week's Menu</a>
          <a href="#about" class="hover:text-orange-600 transition-colors">Meet The Chef</a>
        </div>
        <button class="px-5 py-2.5 bg-stone-900 text-stone-50 text-sm font-semibold rounded-full hover:bg-orange-600 transition-colors dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-orange-500">
          Order for Tonight
        </button>
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      <div class="container mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
        <div class="max-w-2xl">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100 text-orange-800 text-xs font-semibold mb-6 dark:bg-orange-950 dark:text-orange-300">
            <Flame class="w-4 h-4" /> 
            <span>Now taking orders for Friday evening</span>
          </div>
          <h1 class="text-5xl md:text-7xl font-serif font-medium leading-tight mb-6 text-stone-900 dark:text-stone-100">
            Restaurant dining, <br>
            <span class="italic text-orange-600">delivered by the chef.</span>
          </h1>
          <p class="text-lg text-stone-600 dark:text-stone-400 mb-10 leading-relaxed max-w-xl">
            No gig economy drivers. No cold fries. Just a professional chef cooking your meal from scratch and bringing it straight to your dining table.
          </p>
          <div class="flex flex-col sm:flex-row gap-4">
            <button class="flex items-center justify-center gap-2 px-8 py-4 bg-orange-600 text-white rounded-full font-semibold hover:bg-orange-700 transition-all hover:gap-3">
              View This Week's Menu <ArrowRight class="w-5 h-5" />
            </button>
            <button class="px-8 py-4 bg-white border border-stone-200 text-stone-900 rounded-full font-semibold hover:bg-stone-50 transition-colors dark:bg-stone-900 dark:border-stone-800 dark:text-stone-100 dark:hover:bg-stone-800">
              Delivery Zones
            </button>
          </div>
          <div class="mt-10 flex items-center gap-4 text-sm font-medium text-stone-500 dark:text-stone-400">
            <div class="flex -space-x-3">
              <img src="https://i.pravatar.cc/100?img=1" alt="Customer" class="w-10 h-10 rounded-full border-2 border-stone-50 dark:border-stone-950">
              <img src="https://i.pravatar.cc/100?img=2" alt="Customer" class="w-10 h-10 rounded-full border-2 border-stone-50 dark:border-stone-950">
              <img src="https://i.pravatar.cc/100?img=3" alt="Customer" class="w-10 h-10 rounded-full border-2 border-stone-50 dark:border-stone-950">
            </div>
            <div>
              <div class="flex text-orange-500 mb-0.5">
                <Star class="w-4 h-4 fill-current" v-for="i in 5" :key="i" />
              </div>
              <p>Over 500+ happy dinners served.</p>
            </div>
          </div>
        </div>
        
        <div class="relative">
          <div class="absolute -inset-4 bg-orange-200/50 rounded-[3rem] transform rotate-3 dark:bg-orange-900/20"></div>
          <img 
            src="https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&q=80&w=1200" 
            alt="Chef plating food"
            class="relative rounded-[2.5rem] shadow-2xl object-cover h-[600px] w-full"
          >
          <!-- Floating Badge -->
          <div class="absolute bottom-8 left-8 bg-white/90 backdrop-blur-md p-5 rounded-2xl shadow-xl dark:bg-stone-900/90 border border-stone-100 dark:border-stone-800">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center dark:bg-orange-900/50">
                <Clock class="w-6 h-6" />
              </div>
              <div>
                <p class="text-sm text-stone-500 font-medium dark:text-stone-400">Average Delivery</p>
                <p class="text-lg font-bold text-stone-900 dark:text-stone-100">35 Minutes</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section id="how-it-works" class="py-24 bg-stone-100 dark:bg-stone-900">
      <div class="container mx-auto px-6">
        <div class="text-center max-w-2xl mx-auto mb-16">
          <h2 class="text-3xl md:text-4xl font-serif font-medium mb-4">The Artisan Process</h2>
          <p class="text-stone-600 dark:text-stone-400 text-lg">
            Quality takes time, but ordering shouldn't. I've simplified the process so you can enjoy fine dining at home without the hassle.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-8 relative">
          <!-- Connecting line -->
          <div class="hidden md:block absolute top-1/2 left-[15%] right-[15%] h-0.5 bg-stone-300 dark:bg-stone-700 -translate-y-1/2 z-0"></div>
          
          <!-- Step 1 -->
          <div class="relative z-10 flex flex-col items-center text-center">
            <div class="w-20 h-20 bg-white rounded-full shadow-lg flex items-center justify-center mb-6 border-4 border-stone-100 dark:bg-stone-950 dark:border-stone-900">
              <UtensilsCrossed class="w-8 h-8 text-orange-600" />
            </div>
            <h3 class="text-xl font-bold mb-2">1. You Choose</h3>
            <p class="text-stone-600 dark:text-stone-400">
              Select from my curated weekly menu. Order ahead for the weekend or for tonight's service.
            </p>
          </div>
          
          <!-- Step 2 -->
          <div class="relative z-10 flex flex-col items-center text-center">
            <div class="w-20 h-20 bg-white rounded-full shadow-lg flex items-center justify-center mb-6 border-4 border-stone-100 dark:bg-stone-950 dark:border-stone-900">
              <ChefHat class="w-8 h-8 text-orange-600" />
            </div>
            <h3 class="text-xl font-bold mb-2">2. I Prep & Cook</h3>
            <p class="text-stone-600 dark:text-stone-400">
              I source local ingredients daily and cook your meal from scratch just before delivery time.
            </p>
          </div>
          
          <!-- Step 3 -->
          <div class="relative z-10 flex flex-col items-center text-center">
            <div class="w-20 h-20 bg-white rounded-full shadow-lg flex items-center justify-center mb-6 border-4 border-stone-100 dark:bg-stone-950 dark:border-stone-900">
              <Truck class="w-8 h-8 text-orange-600" />
            </div>
            <h3 class="text-xl font-bold mb-2">3. I Deliver</h3>
            <p class="text-stone-600 dark:text-stone-400">
              No third-party apps. I personally drive your meal to your door to ensure it arrives perfectly hot.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- The Menu (Bento Layout) -->
    <section id="menu" class="py-24">
      <div class="container mx-auto px-6">
        <div class="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <h2 class="text-3xl md:text-5xl font-serif font-medium mb-4">This Week's Menu</h2>
            <p class="text-stone-600 dark:text-stone-400 text-lg max-w-xl">
              Rotating weekly based on what's fresh at the market. Limited portions available daily.
            </p>
          </div>
          <button class="px-6 py-3 bg-stone-200 text-stone-900 rounded-full font-medium hover:bg-stone-300 transition-colors dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700">
            View Full Menu
          </button>
        </div>

        <!-- Bento Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <!-- Highlight Dish with Macros -->
          <div class="lg:col-span-2 bg-white rounded-[2rem] overflow-hidden shadow-sm border border-stone-200 flex flex-col sm:flex-row dark:bg-stone-900 dark:border-stone-800">
            <div class="w-full sm:w-1/2 h-64 sm:h-auto">
              <img src="https://images.unsplash.com/photo-1544025162-811114bd4053?auto=format&fit=crop&q=80&w=800" alt="Steak" class="w-full h-full object-cover">
            </div>
            <div class="w-full sm:w-1/2 p-8 flex flex-col justify-between">
              <div>
                <div class="flex justify-between items-start mb-4">
                  <h3 class="text-2xl font-bold">Wagyu Bavette Steak</h3>
                  <span class="text-xl font-serif font-bold text-orange-600">$34</span>
                </div>
                <p class="text-stone-600 dark:text-stone-400 mb-6">
                  Pan-seared medium rare, served with a chimichurri herb sauce, roasted fingerling potatoes, and charred broccolini.
                </p>
                <div class="bg-stone-50 rounded-xl p-4 flex items-center gap-6 dark:bg-stone-950">
                  <div class="w-20 h-20 relative">
                    <Doughnut :data="macroData" :options="macroOptions" />
                  </div>
                  <div class="flex-1">
                    <p class="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-2">Nutrition Profile</p>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                      <div class="flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full bg-orange-600"></span> Protein 45g
                      </div>
                      <div class="flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full bg-amber-300"></span> Carbs 35g
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <button class="mt-6 w-full py-3 bg-stone-900 text-stone-50 rounded-xl font-medium hover:bg-orange-600 transition-colors dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-orange-500">
                Add to Order
              </button>
            </div>
          </div>

          <!-- Regular Menu Cards -->
          <div 
            v-for="item in menuItems.slice(0,2)" 
            :key="item.id" 
            class="bg-white rounded-[2rem] overflow-hidden shadow-sm border border-stone-200 flex flex-col dark:bg-stone-900 dark:border-stone-800 hover:-translate-y-1 transition-transform duration-300"
          >
            <div class="h-48 overflow-hidden relative">
              <img :src="item.image" :alt="item.name" class="w-full h-full object-cover">
              <div class="absolute top-4 left-4 flex gap-2">
                <span 
                  v-for="tag in item.tags" 
                  :key="tag"
                  class="px-3 py-1 bg-white/90 backdrop-blur text-stone-900 text-xs font-bold rounded-full shadow-sm dark:bg-stone-900/90 dark:text-stone-100"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            <div class="p-6 flex flex-col flex-1">
              <div class="flex justify-between items-start mb-2">
                <h3 class="text-xl font-bold">{{ item.name }}</h3>
                <span class="font-serif font-bold text-orange-600">{{ item.price }}</span>
              </div>
              <p class="text-stone-600 dark:text-stone-400 text-sm mb-6 flex-1">
                {{ item.description }}
              </p>
              <button class="w-full py-3 bg-stone-100 text-stone-900 rounded-xl font-medium hover:bg-stone-200 transition-colors dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700">
                Add to Order
              </button>
            </div>
          </div>

        </div>
      </div>
    </section>

    <!-- Personal Touch / About -->
    <section id="about" class="py-24 bg-stone-900 text-stone-50 dark:bg-stone-950">
      <div class="container mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
        <div class="relative">
          <img src="https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&q=80&w=1000" alt="Chef Mateo" class="rounded-2xl shadow-2xl object-cover h-[500px] w-full">
          <div class="absolute -bottom-6 -right-6 w-32 h-32 bg-orange-600 rounded-full flex items-center justify-center p-4 shadow-xl">
             <p class="font-serif text-center leading-tight font-bold text-white">
               12 Yrs<br><span class="text-sm font-sans font-normal opacity-90">Experience</span>
             </p>
          </div>
        </div>
        <div>
          <h2 class="text-3xl md:text-5xl font-serif font-medium mb-6">
            Hi, I'm Mateo.
          </h2>
          <div class="space-y-6 text-stone-300 text-lg">
            <p>
              After spending a decade working the line in Michelin-starred kitchens across the city, I realized something was missing: the direct connection with the people I was cooking for.
            </p>
            <p>
              I started <strong>MateoDirect</strong> because I believe delivery food doesn't have to mean lukewarm, mass-produced junk handled by three different middlemen.
            </p>
            <p>
              When you order from me, you're getting a meal I planned, prepped, cooked, and drove to your house. It's my reputation in every box.
            </p>
          </div>
          <div class="mt-10 flex items-center gap-4">
            <img src="https://ui-avatars.com/api/?name=Mateo+S&background=ea580c&color=fff&rounded=true" alt="Signature" class="w-12 h-12 grayscale opacity-80">
            <span class="font-serif italic text-xl text-stone-400">Chef & Founder</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer / CTA -->
    <footer class="py-20 border-t border-stone-200 bg-white dark:bg-stone-950 dark:border-stone-800">
      <div class="container mx-auto px-6 text-center">
        <ChefHat class="w-12 h-12 text-orange-600 mx-auto mb-6" stroke-width="1.5" />
        <h2 class="text-3xl md:text-4xl font-serif font-medium mb-6">
          Ready for tonight's service?
        </h2>
        <p class="text-stone-600 dark:text-stone-400 mb-10 max-w-md mx-auto">
          Orders close at 4:00 PM daily for same-day delivery. Delivery zones currently limited to downtown and surrounding suburbs.
        </p>
        <button class="px-8 py-4 bg-orange-600 text-white rounded-full font-bold text-lg hover:bg-orange-700 transition-colors shadow-lg shadow-orange-600/20">
          Start Your Order
        </button>
        
        <div class="mt-20 pt-8 border-t border-stone-100 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-stone-500 dark:border-stone-800 dark:text-stone-400">
          <p>© 2026 MateoDirect Artisan Delivery. All rights reserved.</p>
          <div class="flex gap-6">
            <a href="#" class="hover:text-stone-900 dark:hover:text-stone-100">Instagram</a>
            <a href="#" class="hover:text-stone-900 dark:hover:text-stone-100">Contact</a>
            <a href="#" class="hover:text-stone-900 dark:hover:text-stone-100">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<style>
/* Ensure smooth scrolling for anchor links */
html {
 scroll-behavior: smooth;
}
</style>