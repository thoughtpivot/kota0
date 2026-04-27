<script setup lang="ts">
import { ChevronLeft, ChevronRight, GripVertical, MessageSquare, Pencil } from "lucide-vue-next";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import NvibeSourceEditor from "@/subjects/nvibe/NvibeSourceEditor.vue";
import PromptPanel from "@/subjects/nvibe/PromptPanel.vue";
import type { NvibeAppSummary } from "@/subjects/nvibe/nvibeAppTypes";
import { useNvibeApps } from "@/subjects/nvibe/useNvibeApps";
import { useNvibeGeneratedApp } from "@/subjects/nvibe/useNvibeGeneratedApp";

const RAIL_OPEN_KEY = "vibe-nvibe-app-rail-open-v1";
const AI_PANEL_OPEN_KEY = "vibe-nvibe-ai-panel-open-v1";
/** Target width (px) for the AI chat column on md+ (`minmax(16rem, …)`). */
const AI_PANEL_WIDTH_PX_KEY = "vibe-nvibe-ai-panel-max-px-v1";
const DEFAULT_AI_PANEL_WIDTH_PX = 400;
const MIN_AI_PANEL_WIDTH_PX = 300;
const MAX_AI_PANEL_WIDTH_PX = 560;

const router = useRouter();
const activeTab = ref<"preview" | "code">("preview");

function readRailOpen(): boolean {
  try {
    const v = sessionStorage.getItem(RAIL_OPEN_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function persistRailOpen(open: boolean) {
  try {
    sessionStorage.setItem(RAIL_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const appRailOpen = ref(readRailOpen());

watch(appRailOpen, (open) => {
  persistRailOpen(open);
});

function readAiPanelOpen(): boolean {
  try {
    const v = sessionStorage.getItem(AI_PANEL_OPEN_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function persistAiPanelOpen(open: boolean) {
  try {
    sessionStorage.setItem(AI_PANEL_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const aiPanelOpen = ref(readAiPanelOpen());

watch(aiPanelOpen, (open) => {
  persistAiPanelOpen(open);
});

function readAiPanelWidthPx(): number {
  try {
    const v = sessionStorage.getItem(AI_PANEL_WIDTH_PX_KEY);
    const n = v ? Number.parseInt(v, 10) : NaN;
    if (Number.isFinite(n)) {
      return Math.min(MAX_AI_PANEL_WIDTH_PX, Math.max(MIN_AI_PANEL_WIDTH_PX, n));
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_AI_PANEL_WIDTH_PX;
}

function persistAiPanelWidthPx(px: number) {
  try {
    sessionStorage.setItem(AI_PANEL_WIDTH_PX_KEY, String(px));
  } catch {
    /* ignore */
  }
}

const aiPanelMaxPx = ref(readAiPanelWidthPx());

/** Bumped after Code tab **Apply** so AI panel reloads chat (system row from Scribe). */
const chatRefreshKey = ref(0);

const aiGridTrack = computed(
  () => `minmax(${MIN_AI_PANEL_WIDTH_PX}px, ${aiPanelMaxPx.value}px)`,
);

/** MD grid columns (CSS var — Tailwind may not see classes built only in `computed()`). */
const nvibeMdGridTemplate = computed(() => {
  const ai = aiGridTrack.value;
  if (appRailOpen.value && aiPanelOpen.value) {
    return `minmax(12rem,14rem) ${ai} minmax(0,1fr)`;
  }
  if (appRailOpen.value && !aiPanelOpen.value) {
    return "minmax(12rem,14rem) 2.75rem minmax(0,1fr)";
  }
  if (!appRailOpen.value && aiPanelOpen.value) {
    return `2.75rem ${ai} minmax(0,1fr)`;
  }
  return "2.75rem 2.75rem minmax(0,1fr)";
});

let aiResizeActive = false;
let aiResizeStartX = 0;
let aiResizeStartW = 0;
let aiResizePointerId: number | null = null;
let aiResizeGripEl: HTMLElement | null = null;
let aiResizeRafId = 0;
let aiResizePendingPx: number | null = null;

function clampAiPanelMaxPx(px: number): number {
  return Math.min(MAX_AI_PANEL_WIDTH_PX, Math.max(MIN_AI_PANEL_WIDTH_PX, Math.round(px)));
}

function flushAiPanelResizeRaf(): void {
  aiResizeRafId = 0;
  if (aiResizePendingPx === null) return;
  const v = aiResizePendingPx;
  aiResizePendingPx = null;
  if (aiResizeActive) aiPanelMaxPx.value = v;
}

function cancelAiPanelResizeRaf(): void {
  if (aiResizeRafId) {
    cancelAnimationFrame(aiResizeRafId);
    aiResizeRafId = 0;
  }
  if (aiResizePendingPx !== null && aiResizeActive) {
    aiPanelMaxPx.value = aiResizePendingPx;
    aiResizePendingPx = null;
  }
}

function endAiPanelResizeDrag(e: PointerEvent): void {
  if (!aiResizeActive) return;
  if (aiResizePointerId !== null && e.pointerId !== aiResizePointerId) return;

  cancelAiPanelResizeRaf();
  aiResizeActive = false;
  aiResizePointerId = null;
  const el = aiResizeGripEl;
  aiResizeGripEl = null;
  if (el?.hasPointerCapture(e.pointerId)) {
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  document.body.style.removeProperty("cursor");
  document.body.style.removeProperty("user-select");
  persistAiPanelWidthPx(aiPanelMaxPx.value);
}

function onAiPanelResizePointerMove(e: PointerEvent): void {
  if (!aiResizeActive || e.pointerId !== aiResizePointerId) return;
  const dx = e.clientX - aiResizeStartX;
  aiResizePendingPx = clampAiPanelMaxPx(aiResizeStartW + dx);
  if (!aiResizeRafId) {
    aiResizeRafId = requestAnimationFrame(flushAiPanelResizeRaf);
  }
}

function onAiPanelResizePointerDown(e: PointerEvent): void {
  if (!e.isPrimary) return;
  e.preventDefault();
  const el = e.currentTarget;
  if (!(el instanceof HTMLElement)) return;
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  cancelAiPanelResizeRaf();
  aiResizeGripEl = el;
  aiResizePointerId = e.pointerId;
  aiResizeActive = true;
  aiResizeStartX = e.clientX;
  aiResizeStartW = aiPanelMaxPx.value;
  aiResizePendingPx = null;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function nudgeAiPanelWidth(delta: number): void {
  aiPanelMaxPx.value = clampAiPanelMaxPx(aiPanelMaxPx.value + delta);
  persistAiPanelWidthPx(aiPanelMaxPx.value);
}

function resetAiPanelWidth(): void {
  aiPanelMaxPx.value = DEFAULT_AI_PANEL_WIDTH_PX;
  persistAiPanelWidthPx(aiPanelMaxPx.value);
}

const {
  apps,
  activeAppId,
  loading: appsLoading,
  error: appsError,
  renameBusy,
  ensureAtLeastOneApp,
  selectApp,
  renameApp,
  createNewApp,
  removeApp,
} = useNvibeApps();

const { source, loading, applying: sourceApplying, error, dirty, previewPageUrl, load, apply } = useNvibeGeneratedApp(
  () => activeAppId.value,
);

onMounted(() => {
  void (async () => {
    await ensureAtLeastOneApp();
  })();
});

async function onAppliedFromPrompt() {
  await load();
  chatRefreshKey.value += 1;
}

async function onApplyCode() {
  const ok = await apply();
  if (ok) chatRefreshKey.value += 1;
}

async function onNewApp() {
  await createNewApp();
}

async function onDeleteApp() {
  const id = activeAppId.value;
  if (!id || apps.value.length === 0) return;
  if (!window.confirm(`Delete this app from Scribe? This cannot be undone.`)) return;
  await removeApp(id);
}

function toggleAppRail() {
  appRailOpen.value = !appRailOpen.value;
}

function toggleAiPanel() {
  aiPanelOpen.value = !aiPanelOpen.value;
}

function isActive(id: string) {
  return activeAppId.value === id;
}

const editingAppId = ref<string | null>(null);
const editingNameDraft = ref("");
const renameInputRef = ref<HTMLInputElement | null>(null);

function beginEdit(a: NvibeAppSummary) {
  editingAppId.value = a.app_id;
  editingNameDraft.value = a.name;
  void nextTick(() => renameInputRef.value?.focus());
}

function cancelEdit() {
  editingAppId.value = null;
  editingNameDraft.value = "";
}

async function commitEdit(a: NvibeAppSummary) {
  if (editingAppId.value !== a.app_id) return;
  const trimmed = editingNameDraft.value.trim();
  if (trimmed === a.name) {
    cancelEdit();
    return;
  }
  if (trimmed === "") {
    cancelEdit();
    return;
  }
  const ok = await renameApp(a.app_id, trimmed);
  if (ok) cancelEdit();
}

function onAppRowClick(a: NvibeAppSummary) {
  if (editingAppId.value === a.app_id) return;
  selectApp(a.app_id);
}

function onAppRowKeydown(a: NvibeAppSummary, e: KeyboardEvent) {
  if (editingAppId.value) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    selectApp(a.app_id);
  }
}
</script>

<template>
  <div class="flex h-dvh min-h-0 flex-col bg-background text-foreground">
    <header
      class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2 md:px-4"
    >
      <div class="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="shrink-0 md:hidden"
          aria-label="Toggle app list"
          @click="toggleAppRail"
        >
          <ChevronRight v-if="!appRailOpen" class="size-4" />
          <ChevronLeft v-else class="size-4" />
        </Button>
        <Button
          v-if="!aiPanelOpen"
          type="button"
          variant="ghost"
          size="icon"
          class="shrink-0 md:hidden"
          aria-label="Show AI panel"
          @click="toggleAiPanel"
        >
          <MessageSquare class="size-4" />
        </Button>
        <div class="min-w-0">
          <p class="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">nVibe</p>
          <h1 class="truncate font-display text-base font-normal text-foreground md:text-lg">Build workspace</h1>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button type="button" variant="ghost" size="sm" @click="router.push({ name: 'home' })">Home</Button>
        <RouterLink
          to="/marketing"
          class="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Marketing
        </RouterLink>
      </div>
    </header>
    <p v-if="appsError" class="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-1 text-xs text-destructive">
      {{ appsError }}
    </p>

    <!-- Apps | AI | Preview + Code -->
    <div
      class="nvibe-workspace-grid flex min-h-0 flex-1 flex-col md:grid md:grid-rows-1 md:items-stretch"
      :style="{ '--nvibe-md-cols': nvibeMdGridTemplate }"
    >
      <!-- App list rail -->
      <aside
        class="flex shrink-0 flex-col border-b border-border bg-muted/20 md:min-h-0 md:shrink md:border-b-0 md:border-r"
        :class="[
          appRailOpen ? 'max-h-[40vh] min-h-0 md:max-h-none' : 'max-h-0 overflow-hidden md:max-h-none md:overflow-visible',
        ]"
      >
        <!-- Slim strip when rail collapsed (desktop only) -->
        <div
          v-if="!appRailOpen"
          class="hidden h-full min-h-0 flex-col items-center gap-3 border-b border-border py-3 md:flex md:border-b-0"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="shrink-0"
            aria-label="Show app list"
            @click="toggleAppRail"
          >
            <ChevronRight class="size-4" />
          </Button>
        </div>

        <!-- Expanded rail -->
        <div v-show="appRailOpen" class="flex min-h-0 flex-1 flex-col">
          <div class="flex shrink-0 items-center justify-between gap-1 border-b border-border px-2 py-2">
            <div class="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-8 shrink-0 md:hidden"
                aria-label="Hide app list"
                @click="toggleAppRail"
              >
                <ChevronLeft class="size-4" />
              </Button>
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Apps</p>
            </div>
            <div class="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="hidden size-8 shrink-0 md:inline-flex"
                aria-label="Hide app list"
                @click="toggleAppRail"
              >
                <ChevronLeft class="size-4" />
              </Button>
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
              @click="onAppRowClick(a)"
              @keydown="onAppRowKeydown(a, $event)"
            >
              <div class="flex w-full min-w-0 items-start gap-1">
                <input
                  v-if="editingAppId === a.app_id"
                  ref="renameInputRef"
                  v-model="editingNameDraft"
                  type="text"
                  maxlength="120"
                  class="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                  aria-label="App name"
                  :disabled="renameBusy"
                  @click.stop
                  @keydown.enter.prevent="void commitEdit(a)"
                  @keydown.escape.prevent="cancelEdit()"
                  @blur="void commitEdit(a)"
                />
                <template v-else>
                  <span class="line-clamp-2 min-w-0 flex-1 font-medium leading-snug">{{ a.name }}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                    :disabled="appsLoading || renameBusy"
                    aria-label="Rename app"
                    title="Rename"
                    @click.stop="beginEdit(a)"
                  >
                    <Pencil class="size-3.5" />
                  </Button>
                </template>
              </div>
              <span class="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{{ a.status }}</span>
            </div>
          </div>

          <div class="shrink-0 space-y-2 border-t border-border p-2">
            <Button type="button" variant="outline" size="sm" class="w-full" :disabled="appsLoading" @click="onNewApp">
              New app
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="w-full text-destructive hover:bg-destructive/10"
              :disabled="appsLoading || !activeAppId"
              @click="onDeleteApp"
            >
              Delete current app
            </Button>
          </div>
        </div>
      </aside>

      <aside
        class="flex min-h-0 min-w-0 flex-1 flex-col border-b border-border bg-muted/15 md:shrink md:border-b-0 md:border-r"
        :class="[
          aiPanelOpen ? 'max-h-[55vh] min-h-0 md:max-h-none' : 'max-h-0 overflow-hidden md:max-h-none md:overflow-visible',
        ]"
      >
        <div
          v-if="!aiPanelOpen"
          class="hidden h-full min-h-0 flex-col items-center gap-3 border-b border-border py-3 md:flex md:border-b-0"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="shrink-0"
            aria-label="Show AI panel"
            @click="toggleAiPanel"
          >
            <ChevronRight class="size-4" />
          </Button>
        </div>

        <div v-show="aiPanelOpen" class="flex min-h-0 flex-1 min-w-0 flex-col md:flex-row">
          <PromptPanel
            class="flex min-h-0 min-w-0 flex-1 flex-col"
            :active-app-id="activeAppId"
            :refresh-chat-key="chatRefreshKey"
            @applied="onAppliedFromPrompt"
            @collapse-panel="toggleAiPanel"
          />
          <div
            class="hidden h-full min-h-0 w-2 shrink-0 flex-col items-stretch border-l border-border bg-muted/25 md:flex"
          >
            <div class="flex min-h-0 flex-1 flex-col items-center justify-center py-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-8 shrink-0 touch-none cursor-grab touch-manipulation active:cursor-grabbing hover:bg-transparent active:bg-transparent focus-visible:bg-transparent dark:hover:bg-transparent dark:active:bg-transparent dark:focus-visible:bg-transparent hover:text-muted-foreground active:text-muted-foreground focus-visible:text-muted-foreground dark:hover:text-muted-foreground dark:active:text-muted-foreground"
                aria-label="Drag sideways to resize the AI panel"
                title="Drag sideways to resize · Double-click to reset width"
                @pointerdown="onAiPanelResizePointerDown"
                @pointermove="onAiPanelResizePointerMove"
                @pointerup="endAiPanelResizeDrag"
                @pointercancel="endAiPanelResizeDrag"
                @lostpointercapture="endAiPanelResizeDrag"
                @dblclick.prevent="resetAiPanelWidth"
                @keydown.left.prevent="nudgeAiPanelWidth(-12)"
                @keydown.right.prevent="nudgeAiPanelWidth(12)"
              >
                <GripVertical class="size-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <section
        class="flex min-h-0 min-w-0 flex-[1.65] flex-col bg-muted/10 md:h-full md:min-h-0 md:flex-none"
      >
        <div class="flex shrink-0 gap-1 border-b border-border px-2 pt-2">
          <button
            type="button"
            class="rounded-t-md px-3 py-2 text-xs font-medium md:text-sm"
            :class="
              activeTab === 'preview'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="activeTab = 'preview'"
          >
            Preview
          </button>
          <button
            type="button"
            class="rounded-t-md px-3 py-2 text-xs font-medium md:text-sm"
            :class="
              activeTab === 'code' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            "
            @click="activeTab = 'code'"
          >
            Code
          </button>
        </div>

        <div class="relative min-h-0 flex-1 bg-muted/30">
          <iframe
            v-show="activeTab === 'preview'"
            :key="previewPageUrl"
            :src="previewPageUrl"
            title="nVibe — Preview"
            class="absolute inset-0 h-full w-full border-0 bg-white dark:bg-neutral-950"
          />

          <div v-show="activeTab === 'code'" class="absolute inset-0 flex min-h-0 flex-col gap-2 p-2">
            <div class="flex shrink-0 items-center justify-between gap-2">
              <span class="truncate text-xs text-muted-foreground">app/src/nvibe/generated/App.vue (active app)</span>
              <Button type="button" size="sm" :disabled="sourceApplying || !dirty || !activeAppId" @click="onApplyCode">
                {{ sourceApplying ? "Applying…" : "Apply" }}
              </Button>
            </div>
            <p v-if="error" class="shrink-0 text-xs text-destructive">{{ error }}</p>
            <p v-if="loading" class="shrink-0 text-xs text-muted-foreground">Loading…</p>
            <NvibeSourceEditor v-model="source" class="min-h-0 flex-1" :disabled="loading || !activeAppId" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 768px) {
  .nvibe-workspace-grid {
    grid-template-columns: var(--nvibe-md-cols, minmax(12rem, 14rem) minmax(300px, 25rem) minmax(0, 1fr));
  }
}

</style>
