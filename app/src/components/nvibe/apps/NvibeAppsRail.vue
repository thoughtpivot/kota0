<script setup lang="ts">
import type { Component } from "vue";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-vue-next";
import { nextTick, ref, watch } from "vue";
import type { NvibeAppSummary } from "@/components/nvibe/apps/nvibeAppTypes";

const props = defineProps<{
  appRailOpen: boolean;
  apps: NvibeAppSummary[];
  appsLoading: boolean;
  renameBusy: boolean;
  activeAppId: string | null;
  editingAppId: string | null;
  editingNameDraft: string;
  nvibeAppRowIcon: (id: string) => Component;
  resolvedNvibeAppIconId: (a: NvibeAppSummary) => string;
  isActive: (id: string) => boolean;
}>();

const emit = defineEmits<{
  "update:editingNameDraft": [value: string];
  toggleRail: [];
  clickRow: [NvibeAppSummary];
  keydownRow: [NvibeAppSummary, KeyboardEvent];
  beginEdit: [NvibeAppSummary];
  commitEdit: [NvibeAppSummary];
  cancelEdit: [];
  newApp: [];
  deleteApp: [];
}>();

const renameInputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.editingAppId,
  async (id) => {
    if (!id) return;
    await nextTick();
    renameInputRef.value?.focus();
  },
);
</script>

<template>
  <aside
    class="flex shrink-0 flex-col border-b border-border bg-muted/20 md:min-h-0 md:shrink md:border-b-0 md:border-r"
    :class="[
      appRailOpen ? 'max-h-[40vh] min-h-0 md:max-h-none' : 'max-h-0 overflow-hidden md:max-h-none md:overflow-visible',
    ]"
  >
    <div
      v-if="!appRailOpen"
      class="hidden h-full min-h-0 flex-col items-center gap-3 border-b border-border py-3 md:flex md:border-b-0"
    >
      <button
        type="button"
        class="btn btn-ghost btn-square btn-sm shrink-0"
        aria-label="Show app list"
        @click="emit('toggleRail')"
      >
        <ChevronRight class="size-4" />
      </button>
    </div>

    <div v-show="appRailOpen" class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 items-center justify-between gap-1 border-b border-border px-2 py-2">
        <div class="flex min-w-0 items-center gap-1">
          <button
            type="button"
            class="btn btn-ghost btn-square btn-sm size-8 shrink-0 md:hidden"
            aria-label="Hide app list"
            @click="emit('toggleRail')"
          >
            <ChevronLeft class="size-4" />
          </button>
        </div>
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            class="btn btn-ghost btn-square btn-sm hidden size-8 shrink-0 md:inline-flex"
            aria-label="Hide app list"
            @click="emit('toggleRail')"
          >
            <ChevronLeft class="size-4" />
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2" role="list" aria-label="Applications">
        <p v-if="appsLoading" class="px-1 text-xs text-muted-foreground">Loading…</p>
        <div
          v-for="a in apps"
          :key="a.app_id"
          role="listitem"
          tabindex="0"
          class="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md border px-2 py-2 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
          :class="
            isActive(a.app_id)
              ? 'border-primary/40 bg-card text-foreground shadow-sm'
              : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          "
          :aria-label="`Select app ${a.name}`"
          @click="emit('clickRow', a)"
          @keydown="emit('keydownRow', a, $event)"
        >
          <div class="flex w-full min-w-0 items-start gap-1">
            <div
              class="flex size-8 shrink-0 items-center justify-center rounded-md"
              :class="isActive(a.app_id) ? 'text-foreground/90' : 'text-muted-foreground'"
              aria-hidden="true"
            >
              <component
                :is="nvibeAppRowIcon(resolvedNvibeAppIconId(a))"
                :key="`${a.app_id}:${resolvedNvibeAppIconId(a)}`"
                class="size-4 shrink-0"
              />
            </div>
            <input
              v-if="editingAppId === a.app_id"
              ref="renameInputRef"
              :value="editingNameDraft"
              type="text"
              maxlength="120"
              class="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
              aria-label="App name"
              :disabled="renameBusy"
              @click.stop
              @input="emit('update:editingNameDraft', ($event.target as HTMLInputElement).value)"
              @keydown.enter.prevent="emit('commitEdit', a)"
              @keydown.escape.prevent="emit('cancelEdit')"
              @blur="emit('commitEdit', a)"
            />
            <template v-else>
              <span class="line-clamp-2 min-w-0 flex-1 font-medium leading-snug">{{ a.name }}</span>
              <button
                type="button"
                class="btn btn-ghost btn-square btn-sm size-7 shrink-0 text-muted-foreground hover:text-foreground"
                :disabled="appsLoading || renameBusy"
                aria-label="Rename app"
                title="Rename"
                @click.stop="emit('beginEdit', a)"
              >
                <Pencil class="size-3.5" />
              </button>
            </template>
          </div>
        </div>
      </div>

      <div class="shrink-0 space-y-2 border-t border-border p-2">
        <button
          type="button"
          class="btn btn-outline btn-sm w-full"
          :disabled="appsLoading"
          @click="emit('newApp')"
        >
          New app
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm w-full text-destructive hover:bg-destructive/10"
          :disabled="appsLoading || !activeAppId"
          @click="emit('deleteApp')"
        >
          Delete current app
        </button>
      </div>
    </div>
  </aside>
</template>
