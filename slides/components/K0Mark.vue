<script setup lang="ts">
import markUrl from "../../branding/logos/k0-white.svg?url";

withDefaults(
  defineProps<{
    decorative?: boolean;
  }>(),
  { decorative: false },
);
</script>

<template>
  <img
    :src="markUrl"
    :alt="decorative ? '' : 'Kota0'"
    :aria-hidden="decorative ? 'true' : undefined"
  />
</template>
