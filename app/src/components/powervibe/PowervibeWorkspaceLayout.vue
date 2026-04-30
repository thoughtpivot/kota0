<script setup lang="ts">
defineProps<{
  gridTemplate: string;
}>();
</script>

<template>
  <div
    class="powervibe-workspace-grid flex min-h-0 flex-1 flex-col md:grid md:grid-rows-1 md:items-stretch"
    :style="{ '--powervibe-md-cols': gridTemplate }"
  >
    <slot name="rail" />
    <slot name="ai" />
    <slot name="viewer" />
  </div>
</template>
