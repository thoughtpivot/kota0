<script setup lang="ts">
import { powervibeBundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";
import { ref, onMounted, nextTick, computed, watch } from "vue";
import markdownit from "markdown-it";
import { Sun, Moon } from "lucide-vue-next";

const md = markdownit({ html: true, linkify: true });
const isDark = ref(true);

// Ensure the class is applied on load and on every toggle
watch(isDark, (val) => {
  if (val) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}, { immediate: true });

interface Message { id: string; data: { role: string; content: string; timestamp: string } }

const messages = ref<Message[]>([]);
const input = ref("");
const loading = ref(false);
const scrollContainer = ref<HTMLElement | null>(null);

const renderedMessages = computed(() => {
  return messages.value.map(m => ({
    ...m,
    html: md.render(m.data.content)
  }));
});

async function fetchMessages() {
  const r = await fetch(powervibeBundleApiUrl("api/powervibe-app/messages"));
  if (r.ok) messages.value = await r.json();
}

async function send() {
  if (!input.value.trim()) return;
  const content = input.value;
  input.value = "";
  loading.value = true;
  
  await fetch(powervibeBundleApiUrl("api/powervibe-app/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: content })
  });
  
  await fetchMessages();
  loading.value = false;
  nextTick(() => scrollContainer.value?.scrollTo(0, scrollContainer.value.scrollHeight));
}

onMounted(fetchMessages);
</script>

<template>
  <div class="flex flex-col h-screen w-screen p-4 bg-neutral-50 dark:bg-neutral-900 transition-colors duration-300">
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-xl font-bold dark:text-white">PowerVibe Chat</h1>
      <button @click="isDark = !isDark" class="p-2 rounded-full bg-neutral-200 dark:bg-neutral-800 dark:text-white hover:opacity-80 transition-opacity">
        <Sun v-if="isDark" :size="20" />
        <Moon v-else :size="20" />
      </button>
    </div>

    <div ref="scrollContainer" class="flex-1 overflow-y-auto mb-4 space-y-4 p-2">
      <div 
        v-for="m in renderedMessages" 
        :key="m.id" 
        :class="['p-4 rounded-xl prose dark:prose-invert max-w-none', m.data.role === 'user' ? 'ml-auto bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-800']"
      >
        <div v-html="m.html"></div>
      </div>
    </div>
    
    <div class="flex gap-2 w-full max-w-5xl mx-auto">
      <input v-model="input" @keyup.enter="send" class="flex-1 p-3 border rounded-lg dark:bg-neutral-800 dark:border-neutral-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Message the AI..." />
      <button @click="send" :disabled="loading" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Send</button>
    </div>
  </div>
</template>