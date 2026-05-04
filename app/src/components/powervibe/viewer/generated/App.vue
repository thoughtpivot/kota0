<script setup lang="ts">
import { powervibeBundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";
import { ref } from "vue";
import { Bot, Send, Loader2 } from "lucide-vue-next";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: true, linkify: true });
const input = ref("");
const messages = ref<{ id: number; role: 'user' | 'jen'; content: string; html?: string }[]>([]);
const isTyping = ref(false);

async function sendMessage() {
  if (!input.value.trim()) return;
  
  const userMsg = input.value;
  messages.value.push({ id: Date.now(), role: 'user', content: userMsg });
  input.value = "";
  isTyping.value = true;

  try {
    const r = await fetch(powervibeBundleApiUrl("api/powervibe-app/jen/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: userMsg }),
    });
    const data = await r.json();
    if (data.response) {
      messages.value.push({ 
        id: Date.now(), 
        role: 'jen', 
        content: data.response,
        html: md.render(data.response) 
      });
    }
  } catch (e) {
    messages.value.push({ id: Date.now(), role: 'jen', content: "I'm having a little trouble connecting right now." });
  } finally {
    isTyping.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6 flex justify-center">
    <div class="w-full max-w-2xl flex flex-col h-[90vh]">
      <header class="mb-8 flex items-center gap-3">
        <div class="p-2 bg-indigo-600 rounded-xl text-white">
          <Bot size="24" />
        </div>
        <div>
          <h1 class="text-xl font-bold text-neutral-900 dark:text-white">Meet Jen</h1>
          <p class="text-sm text-neutral-500">Your persistent virtual assistant</p>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto space-y-6 mb-6 pr-2">
        <div v-for="msg in messages" :key="msg.id" :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
          <div :class="['max-w-[80%] p-4 rounded-2xl text-sm prose dark:prose-invert', msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 shadow-sm']">
            <div v-if="msg.role === 'user'">{{ msg.content }}</div>
            <div v-else v-html="msg.html"></div>
          </div>
        </div>
        <div v-if="isTyping" class="flex gap-2 text-neutral-400">
          <Loader2 class="animate-spin" size="16" />
          <span class="text-xs">Jen is searching her memory...</span>
        </div>
      </div>

      <div class="relative">
        <input 
          v-model="input" 
          @keyup.enter="sendMessage"
          placeholder="Ask Jen anything..."
          class="w-full p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <button @click="sendMessage" class="absolute right-2 top-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          <Send size="18" />
        </button>
      </div>
    </div>
  </div>
</template>

<style>
.prose { max-width: none !important; }
.prose p { margin-top: 0.5rem; margin-bottom: 0.5rem; }
.prose ul { list-style-type: disc; padding-left: 1.5rem; }
.prose code { background: rgba(0,0,0,0.1); padding: 0.2rem 0.4rem; border-radius: 4px; }
</style>