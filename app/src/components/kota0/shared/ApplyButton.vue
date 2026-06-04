<script setup lang="ts">
withDefaults(
  defineProps<{
    applying: boolean;
    disabled?: boolean;
    label?: string;
    applyingLabel?: string;
  }>(),
  {
    disabled: false,
    label: "Apply",
    applyingLabel: "Applying…",
  },
);

defineEmits<{ apply: [] }>();
</script>

<template>
  <button
    type="button"
    class="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-[#3B82F6] px-3 text-xs font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.98] active:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
    :disabled="disabled || applying"
    @click="$emit('apply')"
  >
    {{ applying ? applyingLabel : label }}
  </button>
</template>
