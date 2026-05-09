<script setup lang="ts">
import { kota0BundleApiUrl } from "@/components/kota0/viewer/kota0BundleApiUrl";
import { ref, onMounted } from "vue";
import { NewspaperIcon, CalendarIcon, ArrowTopRightOnSquareIcon } from "@heroicons/vue/24/outline";

interface NewsItem {
  title: string;
  summary: string;
  source: string;
  date: string;
}

const news = ref<NewsItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function loadNews() {
  loading.value = true;
  try {
    const r = await fetch(kota0BundleApiUrl("api/kota0-app/news"));
    if (!r.ok) throw new Error("Failed to fetch news");
    news.value = await r.json();
  } catch (e) {
    error.value = "Could not load AI industry news.";
  } finally {
    loading.value = false;
  }
}

onMounted(loadNews);
</script>

<template>
  <div class="min-h-screen bg-neutral-50 p-6 md:p-12 dark:bg-neutral-950">
    <div class="mx-auto max-w-3xl">
      <header class="mb-10 flex items-center gap-4">
        <div class="rounded-xl bg-blue-600 p-3 text-white">
          <NewspaperIcon class="h-8 w-8" />
        </div>
        <div>
          <h1 class="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">AI Intel Digest</h1>
          <p class="text-neutral-500">Curated updates on Anthropic, OpenAI, Google, and Grok.</p>
        </div>
      </header>

      <div v-if="loading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="h-32 animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800"></div>
      </div>

      <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
        {{ error }}
      </div>

      <div v-else class="grid gap-6">
        <article 
          v-for="(item, idx) in news" 
          :key="idx"
          class="group rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div class="mb-3 flex items-center justify-between text-xs font-semibold text-blue-600 uppercase tracking-wider">
            <span>{{ item.source }}</span>
            <span class="flex items-center gap-1 text-neutral-400">
              <CalendarIcon class="h-3 w-3" /> {{ item.date }}
            </span>
          </div>
          <h2 class="mb-2 text-xl font-bold text-neutral-900 dark:text-neutral-100">{{ item.title }}</h2>
          <p class="text-neutral-600 dark:text-neutral-400 leading-relaxed">{{ item.summary }}</p>
        </article>
      </div>
    </div>
  </div>
</template>