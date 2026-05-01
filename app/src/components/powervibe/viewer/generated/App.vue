<script setup lang="ts">
import { powervibeBundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";
import { ref, onMounted } from "vue";
import { Folder, File, ChevronRight, ChevronDown, Database, X } from "lucide-vue-next";

interface FileNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: FileNode[];
  isOpen?: boolean;
}

const fileTree = ref<FileNode[]>([]);
const loading = ref(true);
const activeFile = ref<{ name: string; content: string } | null>(null);

const toggleFolder = (node: FileNode) => {
  if (node.type === 'directory') node.isOpen = !node.isOpen;
};

const openFile = async (node: FileNode) => {
  if (node.type === 'file') {
    const r = await fetch(bundleApiUrl(`api/powervibe-app/read?path=${encodeURIComponent(node.path)}`));
    const data = await r.json();
    activeFile.value = { name: node.name, content: data.content };
  }
};

onMounted(async () => {
  try {
    const r = await fetch(powervibeBundleApiUrl("api/powervibe-app/tree"));
    const data = await r.json();
    fileTree.value = data.tree;
  } catch (e) {
    console.error("Load error", e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
    <header class="mb-8 border-b border-neutral-200 dark:border-neutral-800 pb-4">
      <h1 class="text-2xl font-bold flex items-center gap-2 text-neutral-900 dark:text-white">
        <Database class="text-blue-500" /> Project Explorer
      </h1>
    </header>

    <main class="max-w-2xl bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-800 p-6">
      <ul class="font-mono text-sm space-y-1">
        <li v-for="node in fileTree" :key="node.path">
          <div @click="node.type === 'directory' ? toggleFolder(node) : openFile(node)"
               class="flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <span v-if="node.type === 'directory'">
              <component :is="node.isOpen ? ChevronDown : ChevronRight" :size="16" />
            </span>
            <span v-else class="w-4"></span>
            <component :is="node.type === 'directory' ? Folder : File" :size="16" class="text-blue-400" />
            {{ node.name }}
          </div>
          <ul v-if="node.isOpen && node.children" class="ml-6 pl-2 border-l border-neutral-200 dark:border-neutral-800">
            <li v-for="child in node.children" :key="child.path" @click.stop="openFile(child)" 
                class="cursor-pointer text-xs py-1 hover:text-blue-500 text-neutral-600 dark:text-neutral-400">
              {{ child.name }}
            </li>
          </ul>
        </li>
      </ul>
    </main>

    <div v-if="activeFile" class="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm z-50">
      <div class="bg-white dark:bg-neutral-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div class="flex justify-between items-center p-4 border-b dark:border-neutral-800">
          <h2 class="font-bold font-mono">{{ activeFile.name }}</h2>
          <button @click="activeFile = null" class="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full">
            <X :size="20" />
          </button>
        </div>
        <pre class="p-6 overflow-auto max-h-[70vh] text-xs font-mono bg-neutral-50 dark:bg-black">{{ activeFile.content }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
::selection { background: #bfdbfe; color: #1e40af; }
</style>