<script setup lang="ts">
/**
 * Overrides @slidev/client/layouts/center.vue so frontmatter `class:` is applied.
 * Upstream center layout omits `:class` for extra classes, which breaks branded heroes.
 */
const props = defineProps({
  class: String,
});
</script>

<template>
  <div class="slidev-layout center h-full grid place-content-center" :class="props.class">
    <div class="my-auto">
      <slot />
    </div>
  </div>
</template>
