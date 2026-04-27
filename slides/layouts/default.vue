<script setup lang="ts">
/**
 * Overrides @slidev/client/layouts/default.vue so frontmatter `class:` is applied.
 */
const props = defineProps({
  class: String,
});
</script>

<template>
  <div class="slidev-layout default" :class="props.class">
    <slot />
  </div>
</template>
