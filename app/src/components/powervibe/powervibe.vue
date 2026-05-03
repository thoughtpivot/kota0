<script setup lang="ts">
import {
  BoltIcon,
  ChartBarIcon,
  CircleStackIcon,
  CubeIcon,
  RectangleStackIcon,
  SparklesIcon,
  Squares2X2Icon,
  WindowIcon,
} from "@heroicons/vue/24/outline";
import { Loader2 } from "lucide-vue-next";
import type { Component } from "vue";
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PowervibeAiDock from "@/components/powervibe/ai/PowervibeAiDock.vue";
import PowervibeGlobalPromptBar from "@/components/powervibe/ai/PowervibeGlobalPromptBar.vue";
import {
  POWERVIBE_PROMPT_CONTROLLER,
  usePowervibePromptController,
} from "@/components/powervibe/ai/usePowervibePromptController";
import PowervibeFirstAppGate from "@/components/powervibe/apps/PowervibeFirstAppGate.vue";
import PowervibeAppsRail from "@/components/powervibe/apps/PowervibeAppsRail.vue";
import { defaultPowervibeAppIconId, isPowervibeAppIconId } from "@/components/powervibe/apps/powervibeAppIconIds";
import { invalidatePowervibeAppGetDedupe } from "@/components/powervibe/apps/powervibeAppApi";
import { applyPowervibeAppFromQuery } from "@/components/powervibe/apps/usePowervibeAppQueryParam";
import { usePowervibeAiPanelResize } from "@/components/powervibe/apps/usePowervibeAiPanelResize";
import { usePowervibeWorkspaceChrome } from "@/components/powervibe/apps/usePowervibeWorkspaceChrome";
import type { PowervibeAppRowVm } from "@/components/powervibe/apps/powervibeAppTypes";
import { usePowervibeApps } from "@/components/powervibe/apps/usePowervibeApps";
import PowervibeWorkspaceLayout from "@/components/powervibe/PowervibeWorkspaceLayout.vue";
import PowervibeShell from "@/components/powervibe/shell/PowervibeShell.vue";
import PowervibeWorkspaceViewer from "@/components/powervibe/viewer/PowervibeWorkspaceViewer.vue";
import { usePowervibeGeneratedApp } from "@/components/powervibe/viewer/usePowervibeGeneratedApp";

/** Keep keys in sync with `powervibeAppIconIds.ts` (`POWERVIBE_APP_ICON_IDS`). */
const powervibeAppIconById: Record<string, Component> = {
  "squares-2x2": Squares2X2Icon,
  cube: CubeIcon,
  sparkles: SparklesIcon,
  bolt: BoltIcon,
  "rectangle-stack": RectangleStackIcon,
  "circle-stack": CircleStackIcon,
  window: WindowIcon,
  "chart-bar": ChartBarIcon,
};

function powervibeAppRowIcon(iconId: string): Component {
  return powervibeAppIconById[iconId] ?? Squares2X2Icon;
}

/** API may omit `app_icon` on older workers; Scribe may hold unknown strings — always resolve to an allowlisted id. */
function resolvedPowervibeAppIconId(a: PowervibeAppRowVm): string {
  const raw = a.app_icon;
  if (typeof raw === "string" && isPowervibeAppIconId(raw.trim())) return raw.trim();
  return defaultPowervibeAppIconId(a.app_id);
}

const route = useRoute();
const router = useRouter();
const activeTab = ref<"preview" | "code">("preview");

const { appRailOpen, aiPanelOpen, toggleAppRail, toggleAiPanel } = usePowervibeWorkspaceChrome();

const {
  powervibeMdGridTemplate,
  onAiPanelResizePointerDown,
  onAiPanelResizePointerMove,
  endAiPanelResizeDrag,
  nudgeAiPanelWidth: nudgePanelWidth,
  resetAiPanelWidth: resetPanelWidth,
} = usePowervibeAiPanelResize(appRailOpen, aiPanelOpen);

const {
  apps,
  displayApps,
  pendingCreateId,
  deletionUndoPending,
  activeAppId,
  loading: appsLoading,
  error: appsError,
  renameBusy,
  refresh,
  selectApp,
  renameApp,
  createNewApp,
  scheduleRemoveApp,
} = usePowervibeApps();

const creatingNewApp = computed(() => pendingCreateId.value !== null);

/** False until list load + `?app=` resolution — avoids parallel GET /apps/:id for two UUIDs before active id is final. */
const workspaceReady = ref(false);

const {
  source,
  backendSource,
  bundleEnv,
  loading,
  applying: sourceApplying,
  error,
  dirty,
  previewPageUrl,
  load,
  apply,
} = usePowervibeGeneratedApp(() => (workspaceReady.value ? activeAppId.value : null));

/** Bumped after Code tab **Apply** so AI panel reloads chat (system row from Scribe). */
const chatRefreshKey = ref(0);

async function onAppliedFromPrompt() {
  const id = activeAppId.value;
  if (id) invalidatePowervibeAppGetDedupe(id);
  await load({ remountPreview: true, force: true });
  chatRefreshKey.value += 1;
}

const promptController = usePowervibePromptController({
  activeAppId: computed(() => (workspaceReady.value ? activeAppId.value : null)),
  refreshChatKey: chatRefreshKey,
  onApplied: onAppliedFromPrompt,
});
provide(POWERVIBE_PROMPT_CONTROLLER, promptController);

const globalPromptOpen = ref(false);
const globalPromptBarRef = ref<InstanceType<typeof PowervibeGlobalPromptBar> | null>(null);

const firstAppNameDraft = ref("");
const firstAppCreateBusy = ref(false);

async function onFirstAppGateSubmit(opts?: { preset?: "hello" | "blog-scribe" }) {
  const name = firstAppNameDraft.value.trim();
  if (!name || firstAppCreateBusy.value) return;
  firstAppCreateBusy.value = true;
  try {
    await createNewApp(name, opts?.preset === "blog-scribe" ? { preset: "blog-scribe" } : undefined);
  } finally {
    firstAppCreateBusy.value = false;
  }
}

function powervibeCodeDialogOpen(): boolean {
  return !!document.querySelector("dialog.powervibe-code-expand-dialog[open]");
}

function toggleGlobalPromptBar(): void {
  if (globalPromptOpen.value) {
    globalPromptOpen.value = false;
    return;
  }
  globalPromptOpen.value = true;
  void nextTick(() => globalPromptBarRef.value?.focusComposer());
}

function onWorkspacePromptHotkey(e: KeyboardEvent): void {
  if (e.repeat) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === "Escape") {
    if (powervibeCodeDialogOpen()) return;
    if (!globalPromptOpen.value) return;
    e.preventDefault();
    globalPromptOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener("keydown", onWorkspacePromptHotkey, true);
  void (async () => {
    try {
      await refresh();
      await applyPowervibeAppFromQuery(route, router, apps, selectApp);
    } finally {
      workspaceReady.value = true;
    }
  })();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onWorkspacePromptHotkey, true);
});

async function onApplyCode() {
  const ok = await apply();
  if (ok) chatRefreshKey.value += 1;
}

async function onNewApp() {
  await createNewApp();
}

function onDeleteApp() {
  const id = activeAppId.value;
  if (!id || apps.value.length === 0 || deletionUndoPending.value) return;
  scheduleRemoveApp(id);
}

function isActive(id: string) {
  return activeAppId.value === id;
}

const editingAppId = ref<string | null>(null);
const editingNameDraft = ref("");

function beginEdit(a: PowervibeAppRowVm) {
  if (a.pending) return;
  editingAppId.value = a.app_id;
  editingNameDraft.value = a.name;
}

function cancelEdit() {
  editingAppId.value = null;
  editingNameDraft.value = "";
}

async function commitEdit(a: PowervibeAppRowVm) {
  if (a.pending) return;
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

function onAppRowClick(a: PowervibeAppRowVm) {
  if (a.pending) return;
  if (editingAppId.value === a.app_id) return;
  selectApp(a.app_id);
}

function onAppRowKeydown(a: PowervibeAppRowVm, e: KeyboardEvent) {
  if (a.pending) return;
  if (editingAppId.value) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    selectApp(a.app_id);
  }
}
</script>

<template>
  <div
    class="powervibe-workspace-root flex h-dvh min-h-0 flex-col bg-background text-foreground antialiased selection:bg-blue-500/30 selection:text-white"
  >
    <PowervibeShell
      :app-rail-open="appRailOpen"
      :ai-panel-open="aiPanelOpen"
      @toggle-rail="toggleAppRail"
      @toggle-ai-panel="toggleAiPanel"
    />
    <p
      v-if="appsError && !(workspaceReady && apps.length === 0)"
      class="shrink-0 border-b border-rose-500/20 bg-rose-950/30 px-4 py-2 text-xs text-rose-200/90"
    >
      {{ appsError }}
    </p>

    <div
      v-if="!workspaceReady"
      class="flex min-h-0 flex-1 flex-col items-center justify-center bg-black px-4"
      role="status"
      aria-live="polite"
    >
      <Loader2 class="size-8 animate-spin text-[#3B82F6]" aria-hidden="true" />
      <p class="mt-3 text-sm text-slate-500">Loading…</p>
    </div>

    <PowervibeFirstAppGate
      v-else-if="workspaceReady && apps.length === 0 && !deletionUndoPending"
      v-model="firstAppNameDraft"
      :loading="appsLoading"
      :busy="firstAppCreateBusy"
      :error="appsError"
      @submit="onFirstAppGateSubmit"
    />

    <Transition v-else name="powervibe-workspace-reveal">
      <div class="powervibe-workspace-main flex min-h-0 flex-1 flex-col">
        <PowervibeWorkspaceLayout :grid-template="powervibeMdGridTemplate">
          <template #rail>
            <PowervibeAppsRail
              v-model:editing-name-draft="editingNameDraft"
              :app-rail-open="appRailOpen"
              :apps="displayApps"
              :deletion-undo-pending="deletionUndoPending"
              :apps-loading="appsLoading"
              :rename-busy="renameBusy"
              :active-app-id="activeAppId"
              :editing-app-id="editingAppId"
              :powervibe-app-row-icon="powervibeAppRowIcon"
              :resolved-powervibe-app-icon-id="resolvedPowervibeAppIconId"
              :is-active="isActive"
              @toggle-rail="toggleAppRail"
              @click-row="onAppRowClick"
              @keydown-row="(a, e) => onAppRowKeydown(a, e)"
              @begin-edit="beginEdit"
              @commit-edit="(a) => void commitEdit(a)"
              @cancel-edit="cancelEdit"
              @new-app="onNewApp"
              @delete-app="onDeleteApp"
            />
          </template>
          <template #ai>
            <PowervibeAiDock
              :ai-panel-open="aiPanelOpen"
              :active-app-id="activeAppId"
              :global-prompt-open="globalPromptOpen"
              @toggle-ai-panel="toggleAiPanel"
              @toggle-global-prompt="toggleGlobalPromptBar"
              @resize-pointer-down="onAiPanelResizePointerDown"
              @resize-pointer-move="onAiPanelResizePointerMove"
              @resize-pointer-up="endAiPanelResizeDrag"
              @resize-pointer-cancel="endAiPanelResizeDrag"
              @resize-lost-capture="endAiPanelResizeDrag"
              @reset-panel-width="resetPanelWidth"
              @nudge-panel-width="nudgePanelWidth"
            />
          </template>
          <template #viewer>
            <PowervibeWorkspaceViewer
              v-model:active-tab="activeTab"
              v-model:source="source"
              v-model:backend-source="backendSource"
              v-model:bundle-env="bundleEnv"
              :preview-page-url="previewPageUrl"
              :creating-new-app="creatingNewApp"
              :loading="loading"
              :source-applying="sourceApplying"
              :dirty="dirty"
              :error="error"
              :active-app-id="activeAppId"
              @apply-code="onApplyCode"
            />
          </template>
        </PowervibeWorkspaceLayout>

        <PowervibeGlobalPromptBar ref="globalPromptBarRef" v-model="globalPromptOpen" />
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped src="./powervibe.style.scss"></style>

<style lang="scss">
/* Transition classes are injected without scoped `data-v-*`; keep this block unscoped so fade completes. */
.powervibe-workspace-root .powervibe-workspace-reveal-enter-active,
.powervibe-workspace-root .powervibe-workspace-reveal-leave-active {
  transition: opacity 0.28s ease-out;
}

.powervibe-workspace-root .powervibe-workspace-reveal-enter-from,
.powervibe-workspace-root .powervibe-workspace-reveal-leave-to {
  opacity: 0;
}

.powervibe-workspace-root .powervibe-workspace-reveal-enter-to,
.powervibe-workspace-root .powervibe-workspace-reveal-leave-from {
  opacity: 1;
}
</style>
