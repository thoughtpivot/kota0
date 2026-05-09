<script setup lang="ts">
defineProps<{
  gridTemplate: string;
}>();
</script>

<template>
  <div
    class="k0-workspace-grid flex min-h-0 flex-1 flex-col md:grid md:grid-rows-1 md:items-stretch"
    :style="{ '--kota0-md-cols': gridTemplate }"
  >
    <slot name="rail" />
    <slot name="ai" />
    <slot name="viewer" />
  </div>
</template>
