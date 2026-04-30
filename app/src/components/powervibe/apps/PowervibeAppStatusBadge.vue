<script setup lang="ts">
import type { NvibeAppStatus } from "@/components/nvibe/apps/nvibeAppTypes";

const props = defineProps<{
  status: NvibeAppStatus;
}>();

function statusClass(s: NvibeAppStatus): string {
  const map: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-900",
    applied: "bg-sky-500/20 text-sky-900",
    draft: "bg-amber-500/20 text-amber-900",
    error: "bg-destructive/20 text-destructive",
  };
  return map[s] ?? "bg-muted text-muted-foreground";
}
</script>

<template>
  <span
    class="inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize"
    :class="statusClass(props.status)"
  >
    {{ props.status }}
  </span>
</template>
