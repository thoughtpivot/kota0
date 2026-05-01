<script setup lang="ts">
import { ref } from "vue";
import { Bar } from "vue-chartjs";
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from "chart.js";
import { X } from "lucide-vue-next";

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const inventory = ref([
  { id: 1, name: "MacBook Pro 14\"", price: 1299, stock: 4, status: "In Stock", image: "https://images.unsplash.com/photo-1629131726692-1accd0c53ce0?q=80&w=600" },
  { id: 2, name: "iPad Air (5th Gen)", price: 499, stock: 8, status: "In Stock", image: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?q=80&w=600" },
  { id: 3, name: "AirPods Max", price: 429, stock: 5, status: "In Stock", image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?q=80&w=600" },
  { id: 4, name: "MacBook Air M2", price: 899, stock: 0, status: "Sold Out", image: "https://images.unsplash.com/photo-1661961112951-f2bfd1f253ce?q=80&w=600" },
  { id: 5, name: "iPad Pro 11\"", price: 749, stock: 3, status: "In Stock", image: "https://images.unsplash.com/photo-1589739900286-9a259c636f2f?q=80&w=600" },
  { id: 6, name: "AirPods Pro (2nd Gen)", price: 189, stock: 12, status: "In Stock", image: "https://images.unsplash.com/photo-1603351154351-5e2d0600bb77?q=80&w=600" },
  { id: 7, name: "Apple Watch Ultra", price: 599, stock: 2, status: "In Stock", image: "https://images.unsplash.com/photo-1664447635261-f81d1134608c?q=80&w=600" },
  { id: 8, name: "Studio Display", price: 1399, stock: 1, status: "In Stock", image: "https://images.unsplash.com/photo-1647468305044-f65581c7e937?q=80&w=600" },
  { id: 9, name: "Magic Keyboard", price: 129, stock: 15, status: "In Stock", image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?q=80&w=600" },
]);

const selectedProduct = ref<any>(null);
const openDetails = (item: any) => selectedProduct.value = item;

const chartData = {
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  datasets: [{ label: "Interest", backgroundColor: "#262626", data: [45, 52, 38, 65, 48, 80, 72] }]
};
</script>

<template>
  <div class="min-h-screen bg-neutral-50 text-neutral-900 flex relative overflow-hidden">
    <div v-if="selectedProduct" class="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm" @click="selectedProduct = null">
      <div class="w-full max-w-md bg-white h-full p-12 shadow-2xl flex flex-col" @click.stop>
        <button @click="selectedProduct = null" class="mb-8"><X /></button>
        <h2 class="text-4xl font-extralight mb-4">{{ selectedProduct.name }}</h2>
        <p class="text-2xl font-bold mb-6">${{ selectedProduct.price }}</p>
        <img :src="selectedProduct.image" :alt="selectedProduct.name" class="w-full h-80 object-cover mb-8 bg-neutral-100" />
        <button class="w-full bg-neutral-900 text-white py-4 font-bold tracking-widest uppercase hover:bg-black">Buy Now</button>
      </div>
    </div>

    <div class="flex-1">
      <nav class="flex items-center justify-between px-8 py-6 border-b border-neutral-100">
        <h1 class="text-xl font-bold tracking-tighter uppercase">PodResell</h1>
      </nav>

      <main class="mx-auto max-w-5xl px-8 py-12">
        <header class="mb-16">
          <h2 class="text-5xl font-extralight tracking-tighter mb-4">Precision Hardware.</h2>
          <p class="text-neutral-500 max-w-lg">Professionally restored Apple devices. Click a product to view details.</p>
        </header>

        <div class="grid md:grid-cols-3 gap-6">
          <div v-for="item in inventory" :key="item.id" @click="openDetails(item)" class="cursor-pointer group border border-neutral-200 bg-white shadow-sm hover:border-black transition-all">
            <img :src="item.image" :alt="item.name" class="h-48 w-full object-cover bg-neutral-100" />
            <div class="p-6">
              <h3 class="font-medium mb-1">{{ item.name }}</h3>
              <p class="text-lg font-semibold mb-4">${{ item.price }}</p>
              <span :class="['text-[10px] uppercase font-bold tracking-wider px-2 py-1', item.stock > 0 ? 'text-green-700' : 'text-red-700']">
                {{ item.status }}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>