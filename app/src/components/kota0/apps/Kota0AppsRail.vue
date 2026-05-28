<script setup lang="ts">
import type { Component } from "vue";
import { ChevronLeft, ChevronRight, Copy, Pencil, Sparkles } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import type { Kota0AppRowVm } from "@/components/kota0/apps/kota0AppTypes";
import Kota0DeployPanel from "@/components/kota0/deploy/Kota0DeployPanel.vue";

const props = defineProps<{
  appRailOpen: boolean;
  apps: Kota0AppRowVm[];
  appsLoading: boolean;
  /** True while an app is removed locally and DELETE is delayed for undo. */
  deletionUndoPending: boolean;
  renameBusy: boolean;
  activeAppId: string | null;
  editingAppId: string | null;
  editingNameDraft: string;
  kota0AppRowIcon: (id: string) => Component;
  resolvedKota0AppIconId: (a: Kota0AppRowVm) => string;
  isActive: (id: string) => boolean;
}>();

const emit = defineEmits<{
  "update:editingNameDraft": [value: string];
  toggleRail: [];
  clickRow: [Kota0AppRowVm];
  keydownRow: [Kota0AppRowVm, KeyboardEvent];
  beginEdit: [Kota0AppRowVm];
  commitEdit: [Kota0AppRowVm];
  cancelEdit: [];
  newApp: [];
  deleteApp: [];
  duplicateApp: [appId: string];
}>();

const renameInputRef = ref<HTMLInputElement | null>(null);

const hasPendingCreate = computed(() => props.apps.some((a) => a.pending));

/** Collapsed rail: up to ten most recently modified (parent list is `updatedAt` desc; pending row is first). */
const recentAppsForCollapsedRail = computed(() => props.apps.slice(0, 10));

const activeAppVm = computed(() => props.apps.find((a) => a.app_id === props.activeAppId) ?? null);

const deleteDisabled = computed(
  () =>
    props.appsLoading ||
    props.deletionUndoPending ||
    !props.activeAppId ||
    activeAppVm.value?.pending === true,
);

const duplicateDisabled = computed(
  () =>
    props.appsLoading ||
    props.renameBusy ||
    !props.activeAppId ||
    activeAppVm.value?.pending === true,
);

watch(
  () => props.editingAppId,
  async (id) => {
    if (!id) return;
    await nextTick();
    renameInputRef.value?.focus();
  },
);

function onRowClick(a: Kota0AppRowVm) {
  if (a.pending) return;
  emit("clickRow", a);
}

function onRowKeydown(a: Kota0AppRowVm, e: KeyboardEvent) {
  if (a.pending) return;
  emit("keydownRow", a, e);
}
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
      <button
        v-for="a in recentAppsForCollapsedRail"
        :key="`recent-${a.app_id}`"
        type="button"
        class="btn btn-ghost btn-square btn-sm shrink-0 touch-manipulation"
        :class="
          isActive(a.app_id) ? 'border border-primary/35 bg-card text-foreground shadow-sm' : 'text-muted-foreground'
        "
        :disabled="a.pending"
        :aria-label="a.pending ? 'Creating new app' : `Open app ${a.name}`"
        :aria-current="isActive(a.app_id) ? 'true' : undefined"
        @click="onRowClick(a)"
      >
        <template v-if="a.pending">
          <div class="kota0-pending-icon-ring relative flex size-8 items-center justify-center" aria-hidden="true">
            <div class="kota0-pending-conic pointer-events-none absolute inset-0 rounded-md" />
            <Sparkles class="relative z-[1] size-3.5 text-primary" />
          </div>
        </template>
        <component
          :is="kota0AppRowIcon(resolvedKota0AppIconId(a))"
          v-else
          :key="`recent-icon-${a.app_id}:${resolvedKota0AppIconId(a)}`"
          class="size-4 shrink-0"
          aria-hidden="true"
        />
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

      <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2" role="list" aria-label="Applications">
        <p v-if="appsLoading && apps.length === 0" class="px-1 text-xs text-muted-foreground">Loading…</p>
        <p v-else-if="apps.length === 0" class="px-1 text-xs text-muted-foreground">No apps yet — tap New app below.</p>
        <TransitionGroup v-else name="kota0-app-row" tag="div" class="space-y-1">
          <div
            v-for="a in apps"
            :key="a.app_id"
            role="listitem"
            :tabindex="a.pending ? -1 : 0"
            class="flex w-full flex-col items-start gap-0.5 rounded-md border px-2 py-2 text-left text-xs outline-none transition-colors md:text-sm"
            :class="[
              a.pending ? 'kota0-app-row-pending cursor-default border-primary/35 bg-card/40' : 'cursor-pointer',
              !a.pending && isActive(a.app_id)
                ? 'border-primary/40 bg-card text-foreground shadow-sm'
                : '',
              !a.pending && !isActive(a.app_id)
                ? 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                : '',
            ]"
            :aria-busy="a.pending ? 'true' : undefined"
            :aria-label="a.pending ? 'Creating new app, please wait' : `Select app ${a.name}`"
            @click="onRowClick(a)"
            @keydown="onRowKeydown(a, $event)"
          >
            <div class="flex w-full min-w-0 items-center gap-1">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-md"
                :class="
                  a.pending ? 'text-primary' : isActive(a.app_id) ? 'text-foreground/90' : 'text-muted-foreground'
                "
                aria-hidden="true"
              >
                <template v-if="a.pending">
                  <div class="kota0-pending-icon-ring relative flex size-8 items-center justify-center">
                    <div class="kota0-pending-conic pointer-events-none absolute inset-0 rounded-md" />
                    <Sparkles class="relative z-[1] size-3.5 text-primary" />
                  </div>
                </template>
                <component
                  :is="kota0AppRowIcon(resolvedKota0AppIconId(a))"
                  v-else
                  :key="`${a.app_id}:${resolvedKota0AppIconId(a)}`"
                  class="size-4 shrink-0"
                />
              </div>
              <template v-if="a.pending">
                <div class="motion-safe:animate-pulse min-w-0 flex-1 space-y-1.5 py-0.5">
                  <p class="text-[11px] font-medium leading-snug text-muted-foreground md:text-xs">
                    Creating new app…
                  </p>
                  <div class="kota0-shimmer-bar h-2 w-full max-w-[12rem] rounded-full" />
                </div>
              </template>
              <template v-else>
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
              </template>
            </div>
          </div>
        </TransitionGroup>
      </div>

      <div class="shrink-0 space-y-2 border-t border-border p-2">
        <button
          type="button"
          class="btn btn-outline btn-sm w-full"
          :disabled="appsLoading || hasPendingCreate"
          @click="emit('newApp')"
        >
          New app
        </button>
        <Kota0DeployPanel :app-id="activeAppId" />
        <button
          type="button"
          class="btn btn-ghost btn-sm w-full inline-flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground"
          :disabled="duplicateDisabled"
          aria-label="Duplicate current app"
          @click="activeAppId && emit('duplicateApp', activeAppId)"
        >
          <Copy class="size-3.5" aria-hidden="true" />
          Duplicate current app
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm w-full text-destructive hover:bg-destructive/10"
          :disabled="deleteDisabled"
          @click="emit('deleteApp')"
        >
          Delete current app
        </button>
      </div>
    </div>
  </aside>
</template>
