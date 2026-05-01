<script setup lang="ts">
import { ref } from "vue";
import { Plus, Settings, Play, Trash2, GripVertical, Link, Move, CheckCircle2 } from "lucide-vue-next";

interface Node {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
}

interface Connection {
  from: string;
  to: string;
}

const nodes = ref<Node[]>([]);
const connections = ref<Connection[]>([]);
const activeConnectionSource = ref<string | null>(null);
const draggingNode = ref<string | null>(null);
const offset = ref({ x: 0, y: 0 });

const nodeTypes = [
  { type: "trigger", label: "Trigger Event", color: "text-amber-500" },
  { type: "action", label: "System Action", color: "text-blue-500" },
  { type: "transform", label: "Data Map", color: "text-purple-500" },
  { type: "condition", label: "Conditional", color: "text-emerald-500" },
];

function onDragStart(event: DragEvent, type: string) {
  event.dataTransfer?.setData("nodeType", type);
}

function onDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData("nodeType");
  if (!type) return;
  
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  nodes.value.push({
    id: Math.random().toString(36).substring(7),
    type,
    label: nodeTypes.find(n => n.type === type)?.label || "New Node",
    x: event.clientX - rect.left - 120,
    y: event.clientY - rect.top - 50,
  });
}

function startMove(event: MouseEvent, id: string) {
  const node = nodes.value.find(n => n.id === id);
  if (!node) return;
  draggingNode.value = id;
  offset.value = { x: event.clientX - node.x, y: event.clientY - node.y };
}

function onMouseMove(event: MouseEvent) {
  if (!draggingNode.value) return;
  const node = nodes.value.find(n => n.id === draggingNode.value);
  if (node) {
    node.x = event.clientX - offset.value.x;
    node.y = event.clientY - offset.value.y;
  }
}

function stopMove() {
  draggingNode.value = null;
}

function toggleConnection(id: string) {
  if (activeConnectionSource.value === id) {
    activeConnectionSource.value = null;
  } else if (activeConnectionSource.value) {
    // Prevent duplicate connections
    if (!connections.value.find(c => c.from === activeConnectionSource.value && c.to === id)) {
      connections.value.push({ from: activeConnectionSource.value, to: id });
    }
    activeConnectionSource.value = null;
  } else {
    activeConnectionSource.value = id;
  }
}

function getNodePos(id: string) {
  const node = nodes.value.find(n => n.id === id);
  return node ? { x: node.x + 96, y: node.y + 45 } : { x: 0, y: 0 };
}

function removeNode(id: string) {
  nodes.value = nodes.value.filter(n => n.id !== id);
  connections.value = connections.value.filter(c => c.from !== id && c.to !== id);
}
</script>

<template>
  <div class="h-screen w-full flex flex-col bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 overflow-hidden" 
       @mousemove="onMouseMove" @mouseup="stopMove">
    <header class="h-16 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between px-6 bg-white dark:bg-neutral-900 z-20">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
          <CheckCircle2 :size="18" />
        </div>
        <h1 class="text-lg font-bold tracking-tight">Workflow Architect</h1>
      </div>
      <button class="bg-neutral-900 dark:bg-white hover:opacity-80 text-white dark:text-neutral-900 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
        <Play :size="14" /> Deploy Pipeline
      </button>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <aside class="w-64 border-r border-neutral-200 dark:border-neutral-800 p-4 space-y-6">
        <div class="space-y-2">
          <h2 class="text-[10px] font-bold uppercase text-neutral-400 tracking-wider px-1">Components</h2>
          <div v-for="item in nodeTypes" :key="item.type" draggable="true" @dragstart="onDragStart($event, item.type)"
               class="p-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl cursor-grab hover:border-blue-500 hover:shadow-md transition-all flex items-center gap-3">
            <GripVertical class="text-neutral-300" :size="16" />
            <span class="text-sm font-medium">{{ item.label }}</span>
          </div>
        </div>
        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
          <p class="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            <strong>Tip:</strong> Click the link icon on a node to start a connection, then click any other node to finish it.
          </p>
        </div>
      </aside>

      <main class="flex-1 relative bg-neutral-100 dark:bg-neutral-900/30 overflow-hidden" @dragover.prevent @drop="onDrop">
        <svg class="absolute inset-0 w-full h-full pointer-events-none z-0">
          <line v-for="(conn, i) in connections" :key="i"
                :x1="getNodePos(conn.from).x" :y1="getNodePos(conn.from).y"
                :x2="getNodePos(conn.to).x" :y2="getNodePos(conn.to).y"
                stroke="#3b82f6" stroke-width="3" stroke-linecap="round" class="opacity-40" />
        </svg>
        
        <div v-for="node in nodes" :key="node.id" 
             @mousedown="startMove($event, node.id)"
             class="absolute p-4 bg-white dark:bg-neutral-800 border-2 rounded-2xl shadow-xl w-48 transition-all z-10 cursor-grab active:cursor-grabbing"
             :class="[activeConnectionSource === node.id ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-neutral-200 dark:border-neutral-700']"
             :style="{ left: `${node.x}px`, top: `${node.y}px` }">
          <div class="flex justify-between items-start mb-3">
            <span class="text-[10px] font-bold uppercase tracking-wider" :class="nodeTypes.find(n => n.type === node.type)?.color">
              {{ node.type }}
            </span>
            <div class="flex gap-1">
              <button @click.stop="toggleConnection(node.id)" 
                      class="p-1 rounded-md transition-colors"
                      :class="activeConnectionSource === node.id ? 'bg-blue-100 text-blue-600' : 'hover:bg-neutral-100 text-neutral-400'">
                <Link :size="14" />
              </button>
              <button @click.stop="removeNode(node.id)" class="p-1 hover:bg-red-50 text-neutral-400 hover:text-red-500 rounded-md transition-colors">
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
          <p class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{{ node.label }}</p>
        </div>
        
        <div v-if="nodes.length === 0" class="flex flex-col items-center justify-center h-full text-neutral-400 select-none">
          <div class="w-20 h-20 bg-neutral-200/50 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-6">
            <Plus :size="32" class="opacity-50" />
          </div>
          <p class="text-sm">Drag components here to build your flow</p>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
::selection { background: #3b82f6; color: white; }
.dark ::selection { background: #3b82f6; color: white; }
</style>