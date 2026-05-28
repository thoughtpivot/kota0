<script setup lang="ts">
import type { Kota0Plan } from "@shared/kota0Plan";

defineProps<{
  plan: Kota0Plan;
}>();
</script>

<template>
  <div class="w-full rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs shadow-sm md:text-sm">
    <p class="text-[0.7rem] font-medium uppercase tracking-wide text-primary">Plan</p>
    <p class="mt-1 font-medium text-foreground">{{ plan.intent }}</p>
    <ul
      v-if="(plan.userOutline ?? []).length > 0"
      class="mt-2 list-disc space-y-0.5 pl-4 text-foreground"
    >
      <li v-for="(step, i) in plan.userOutline" :key="`o-${i}`">
        {{ step }}
      </li>
    </ul>
    <!-- Legacy plans (pre-userOutline) fall back to the technical changes list. -->
    <ul
      v-else-if="(plan.changes ?? []).length > 0"
      class="mt-2 list-disc space-y-0.5 pl-4 text-foreground"
    >
      <li v-for="(change, i) in plan.changes" :key="`c-${i}`">
        <span class="font-mono text-[0.7rem] text-muted-foreground">[{{ change.kind }}] {{ change.file }}:</span>
        {{ change.summary }}
      </li>
    </ul>
    <p
      v-if="(plan.preserveExplicitly ?? []).length > 0"
      class="mt-2 rounded border border-amber-400/40 bg-amber-50/40 px-2 py-1 text-[0.7rem] text-amber-900 dark:bg-amber-900/20 dark:text-amber-100"
    >
      <strong>Will preserve:</strong>
      {{ plan.preserveExplicitly.join(", ") }}
    </p>
  </div>
</template>
