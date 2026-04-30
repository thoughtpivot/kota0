<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { Radar } from 'vue-chartjs';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

// --- State ---
const nodes = ref<Record<string, { x: number, y: number, type: string, id: string }>>({
  'n1': { id: 'n1', type: 'ingest', x: 50, y: 100 },
  'n2': { id: 'n2', type: 'process', x: 450, y: 150 },
  'n3': { id: 'n3', type: 'action', x: 850, y: 100 }
});

const activeNode = ref<string | null>(null);
const offset = ref({ x: 0, y: 0 });
const logMessages = ref<string[]>(["[SYS] Nexus.Core initialized. Ready for deployment."]);
const logsContainer = ref<HTMLElement | null>(null);

const pushLog = (msg: string) => {
  logMessages.value.push(msg);
  nextTick(() => { if (logsContainer.value) logsContainer.value.scrollTop = logsContainer.value.scrollHeight; });
};

const addNode = (type: string) => {
  const id = 'n' + Date.now();
  nodes.value[id] = { id, type, x: 100 + (Object.keys(nodes.value).length * 20), y: 200 };
  pushLog(`[ACTION] Added node: ${type}`);
};

const startDrag = (e: MouseEvent, key: string) => {
  activeNode.value = key;
  offset.value = { x: e.clientX - nodes.value[key].x, y: e.clientY - nodes.value[key].y };
};

const onDrag = (e: MouseEvent) => {
  if (activeNode.value) {
    nodes.value[activeNode.value].x = e.clientX - offset.value.x;
    nodes.value[activeNode.value].y = e.clientY - offset.value.y;
  }
};

const stopDrag = () => activeNode.value = null;

const chartData = computed(() => ({
  labels: ['Structural', 'Mechanical', 'Safety', 'Schedule', 'Cost'],
  datasets: [{ backgroundColor: 'rgba(139, 92, 246, 0.2)', borderColor: '#8b5cf6', data: [85, 92, 88, 94, 90] }]
}));

onMounted(() => {
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
});
</script>

<template>
  <div class="h-screen w-screen bg-[#09090b] text-zinc-300 font-sans overflow-hidden flex flex-col">
    <header class="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-black/50 backdrop-blur z-50 shrink-0">
       <h1 class="text-white font-black tracking-tight italic">Nexus<span class="text-violet-500">.</span>Core</h1>
       <div class="flex gap-2">
         <button @click="addNode('ingest')" class="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-bold uppercase transition">Add Ingest</button>
         <button @click="addNode('process')" class="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-bold uppercase transition">Add Process</button>
         <button @click="addNode('action')" class="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-bold uppercase transition">Add Action</button>
         <button @click="addNode('report')" class="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-bold uppercase transition">Add Report</button>
       </div>
    </header>

    <main class="flex-1 relative cursor-crosshair bg-[radial-gradient(#18181b_1px,transparent_1px)] [background-size:32px_32px]">
      <div v-for="(node, key) in nodes" :key="node.id" 
           class="absolute w-72 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-20 cursor-grab active:cursor-grabbing"
           :style="{ left: node.x + 'px', top: node.y + 'px' }"
           @mousedown="startDrag($event, key)">
        <div class="p-3 border-b border-zinc-800 font-black text-[9px] uppercase tracking-widest text-zinc-500 select-none">{{ node.type }} Node</div>
        <div class="p-4">
           <div v-if="node.type === 'process'" class="h-24"><Radar :data="chartData" :options="{plugins:{legend:{display:false}}}" /></div>
           <div v-else-if="node.type === 'report'" class="h-24 flex flex-col justify-center gap-2">
              <div class="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div class="w-2/3 h-full bg-emerald-500"></div></div>
              <p class="text-[10px] text-zinc-400">PDF Generation: Ready</p>
           </div>
           <div v-else class="h-24 flex items-center justify-center text-[10px] text-zinc-600">Module: {{ node.type }} active.</div>
        </div>
      </div>
    </main>

    <footer class="h-48 bg-zinc-950 border-t border-zinc-800 p-6 font-mono text-[10px] overflow-y-auto shrink-0" ref="logsContainer">
       <div v-for="(log, i) in logMessages" :key="i" class="text-zinc-500 py-0.5 border-l-2 border-zinc-800 pl-3 mb-1">{{ log }}</div>
    </footer>
  </div>
</template>