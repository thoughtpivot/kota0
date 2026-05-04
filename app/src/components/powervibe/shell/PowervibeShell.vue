<script setup lang="ts">
import { BookOpen, ChevronLeft, ChevronRight, MessageSquare } from "lucide-vue-next";
import { useTemplateRef } from "vue";
import PowervibeGuideDeckDialog from "@/components/powervibe/shell/PowervibeGuideDeckDialog.vue";

defineProps<{
  appRailOpen: boolean;
  aiPanelOpen: boolean;
}>();

const guideDeckDialog = useTemplateRef<InstanceType<typeof PowervibeGuideDeckDialog>>("guideDeckDialog");

function openGuideDeck() {
  guideDeckDialog.value?.open();
}

defineEmits<{
  toggleRail: [];
  toggleAiPanel: [];
}>();
</script>

<template>
  <header
    class="powervibe-workspace-header sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-[#0F1115]/85 px-4 py-2.5 backdrop-blur-xl supports-[backdrop-filter]:bg-[#0F1115]/70 md:px-4"
  >
    <div class="flex min-w-0 items-center gap-2">
      <button
        type="button"
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-[#3B82F6] focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500/40 md:hidden"
        aria-label="Toggle app list"
        @click="$emit('toggleRail')"
      >
        <ChevronRight v-if="!appRailOpen" class="size-4" />
        <ChevronLeft v-else class="size-4" />
      </button>
      <button
        v-if="!aiPanelOpen"
        type="button"
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-[#3B82F6] focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500/40 md:hidden"
        aria-label="Show AI panel"
        @click="$emit('toggleAiPanel')"
      >
        <MessageSquare class="size-4" />
      </button>
      <div class="min-w-0 pr-1">
        <h1
          class="font-display text-base font-semibold tracking-[-0.02em] text-slate-100 sm:text-lg"
        >
          <span class="text-slate-100">PowerVibe</span
          ><span
            class="ml-0.5 font-mono text-[0.85em] font-medium text-[#3B82F6]"
            >.workspace</span
          >
        </h1>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <button
        type="button"
        class="inline-flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-[#3B82F6] focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500/40"
        aria-label="Open briefing deck"
        @click="openGuideDeck"
      >
        <BookOpen class="size-4" aria-hidden="true" />
      </button>
    </div>

    <PowervibeGuideDeckDialog ref="guideDeckDialog" />
  </header>
</template>
