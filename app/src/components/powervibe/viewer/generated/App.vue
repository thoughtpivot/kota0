<script setup lang="ts">
import { powervibeBundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";
import { ref, onMounted } from "vue";
const articles = ref<any[]>([]);
const showAdmin = ref(false);
const editingId = ref<string | null>(null);
const form = ref({ title: '', excerpt: '', content: '' });

const fetchArticles = async () => {
  const r = await fetch(powervibeBundleApiUrl("api/powervibe-app/articles"));
  articles.value = await r.json();
};

const saveArticle = async () => {
  const isEditing = !!editingId.value;
  const url = isEditing ? `api/powervibe-app/articles/${editingId.value}` : 'api/powervibe-app/articles';
  
  await fetch(powervibeBundleApiUrl(url), {
    method: isEditing ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form.value)
  });
  
  form.value = { title: '', excerpt: '', content: '' };
  editingId.value = null;
  await fetchArticles();
};

const deleteArticle = async (id: string) => {
  await fetch(powervibeBundleApiUrl(`api/powervibe-app/articles/${id}`), { method: 'DELETE' });
  await fetchArticles();
};

const editArticle = (article: any) => {
  editingId.value = article.id;
  form.value = { ...article.data };
  showAdmin.value = true;
};

onMounted(fetchArticles);
</script>

<template>
  <div class="min-h-screen bg-[#FAFAFA] text-black font-sans selection:bg-black selection:text-white">
    <!-- Public Header -->
    <header class="p-12 border-b border-black">
      <h1 class="text-[clamp(2rem,8vw,6rem)] font-bold tracking-tighter uppercase italic">Architect.</h1>
      <p class="text-xs uppercase tracking-[0.5em] mt-4 opacity-50">Editorial Intelligence</p>
    </header>

    <!-- Main Content Feed -->
    <main class="max-w-4xl mx-auto p-12 space-y-24">
      <article v-for="a in articles" :key="a.id" class="group">
        <div class="flex justify-between items-start mb-4">
          <span class="text-[10px] uppercase tracking-widest font-bold">{{ a.data.date }}</span>
        </div>
        <h2 class="text-4xl font-bold mb-6 group-hover:underline cursor-pointer">{{ a.data.title }}</h2>
        <p class="text-lg leading-relaxed text-neutral-600">{{ a.data.excerpt }}</p>
        <div class="mt-8 pt-8 border-t border-neutral-200">{{ a.data.content }}</div>
      </article>

      <div v-if="articles.length === 0" class="text-center py-24 border border-dashed border-neutral-300">
        <p class="uppercase text-[10px] tracking-widest">No entries found. Enter manager to publish.</p>
      </div>
    </main>

    <!-- Admin Trigger -->
    <button @click="showAdmin = !showAdmin" class="fixed bottom-8 right-8 bg-black text-white p-4 text-[9px] uppercase tracking-[0.2em] z-[300]">
      {{ showAdmin ? 'Close Manager' : 'Manage Content' }}
    </button>

    <!-- Admin Overlay -->
    <div v-if="showAdmin" class="fixed inset-0 bg-white z-[200] p-12 overflow-y-auto">
      <div class="max-w-6xl mx-auto grid grid-cols-2 gap-12">
        <div>
          <h2 class="text-4xl font-bold mb-8">{{ editingId ? 'Edit Entry' : 'New Entry' }}</h2>
          <input v-model="form.title" class="w-full p-4 border border-black mb-4 bg-transparent" placeholder="Title" />
          <textarea v-model="form.excerpt" class="w-full p-4 border border-black mb-4 h-32 bg-transparent" placeholder="Excerpt" />
          <textarea v-model="form.content" class="w-full p-4 border border-black mb-4 h-48 bg-transparent" placeholder="Full Content" />
          <div class="flex gap-4">
            <button @click="saveArticle" class="bg-black text-white px-8 py-4 uppercase text-[10px] tracking-widest">
              {{ editingId ? 'Update Entry' : 'Publish Entry' }}
            </button>
            <button v-if="editingId" @click="editingId = null; form = {title: '', excerpt: '', content: ''}" class="underline text-[10px]">Cancel</button>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-xs uppercase tracking-widest text-neutral-400">Existing Entries</h3>
          <div v-for="a in articles" :key="a.id" class="p-6 border border-neutral-200 flex justify-between items-center hover:border-black transition-colors">
            <span class="font-medium">{{ a.data.title }}</span>
            <div class="flex gap-4">
              <button @click="editArticle(a)" class="text-[9px] underline">Edit</button>
              <button @click="deleteArticle(a.id)" class="text-[9px] text-red-500">Delete</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>