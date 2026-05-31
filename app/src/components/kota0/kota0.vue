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
import { computed, onMounted, provide, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Kota0AiDock from "@/components/kota0/ai/Kota0AiDock.vue";
import Kota0GlobalPromptBar from "@/components/kota0/ai/Kota0GlobalPromptBar.vue";
import {
  K0_PROMPT_CONTROLLER,
  useKota0PromptController,
} from "@/components/kota0/ai/useKota0PromptController";
import { useKota0GlobalPrompt } from "@/components/kota0/ai/useKota0GlobalPrompt";
import Kota0FirstAppGate from "@/components/kota0/apps/Kota0FirstAppGate.vue";
import Kota0AppsRail from "@/components/kota0/apps/Kota0AppsRail.vue";
import { defaultKota0AppIconId, isKota0AppIconId } from "@/components/kota0/apps/kota0AppIconIds";
import { applyKota0AppFromQuery } from "@/components/kota0/apps/useKota0AppQueryParam";
import { useKota0AiPanelResize } from "@/components/kota0/apps/useKota0AiPanelResize";
import { useKota0WorkspaceChrome } from "@/components/kota0/apps/useKota0WorkspaceChrome";
import type { Kota0AppRowVm } from "@/components/kota0/apps/kota0AppTypes";
import { invalidateKota0AppGetDedupe } from "@/components/kota0/apps/kota0AppApi";
import { useKota0Apps } from "@/components/kota0/apps/useKota0Apps";
import { useKota0AppEditor } from "@/components/kota0/apps/useKota0AppEditor";
import Kota0WorkspaceLayout from "@/components/kota0/Kota0WorkspaceLayout.vue";
import Kota0Shell from "@/components/kota0/shell/Kota0Shell.vue";
import Kota0WorkspaceViewer from "@/components/kota0/viewer/Kota0WorkspaceViewer.vue";
import { useKota0GeneratedApp } from "@/components/kota0/viewer/useKota0GeneratedApp";

/** Keep keys in sync with `kota0AppIconIds.ts` (`K0_APP_ICON_IDS`). */
const kota0AppIconById: Record<string, Component> = {
  "squares-2x2": Squares2X2Icon,
  cube: CubeIcon,
  sparkles: SparklesIcon,
  bolt: BoltIcon,
  "rectangle-stack": RectangleStackIcon,
  "circle-stack": CircleStackIcon,
  window: WindowIcon,
  "chart-bar": ChartBarIcon,
};

function kota0AppRowIcon(iconId: string): Component {
  return kota0AppIconById[iconId] ?? Squares2X2Icon;
}

/** API may omit `app_icon` on older workers; Scribe may hold unknown strings — always resolve to an allowlisted id. */
function resolvedKota0AppIconId(a: Kota0AppRowVm): string {
  const raw = a.app_icon;
  if (typeof raw === "string" && isKota0AppIconId(raw.trim())) return raw.trim();
  return defaultKota0AppIconId(a.app_id);
}

const route = useRoute();
const router = useRouter();
const activeTab = ref<"preview" | "code">("preview");

const { appRailOpen, aiPanelOpen, toggleAppRail, toggleAiPanel } = useKota0WorkspaceChrome();

const {
  kota0MdGridTemplate,
  onAiPanelResizePointerDown,
  onAiPanelResizePointerMove,
  endAiPanelResizeDrag,
  nudgeAiPanelWidth: nudgePanelWidth,
  resetAiPanelWidth: resetPanelWidth,
} = useKota0AiPanelResize(appRailOpen, aiPanelOpen);

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
  duplicateApp,
  previewStartImmediate,
} = useKota0Apps();

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
  previewRequested,
  previewStarting,
  bundlePhase,
  lastBuildError,
  load,
  apply,
  startPreview,
  refreshPreviewAfterSourceChange,
} = useKota0GeneratedApp(() => (workspaceReady.value ? activeAppId.value : null), {
  previewStartImmediate,
});

/** Bumped after Code tab **Apply** so AI panel reloads chat (system row from Scribe). */
const chatRefreshKey = ref(0);

async function onAppliedFromPrompt(payload?: { bundleFingerprint?: string }) {
  const id = activeAppId.value;
  if (id) invalidateKota0AppGetDedupe(id);
  await load({ force: true });
  if (previewRequested.value) {
    await refreshPreviewAfterSourceChange(payload?.bundleFingerprint);
  } else {
    await startPreview();
  }
  chatRefreshKey.value += 1;
}

const promptController = useKota0PromptController({
  activeAppId: computed(() => (workspaceReady.value ? activeAppId.value : null)),
  refreshChatKey: chatRefreshKey,
  onApplied: onAppliedFromPrompt,
});
provide(K0_PROMPT_CONTROLLER, promptController);

const { globalPromptOpen, globalPromptBarRef, toggleGlobalPromptBar } = useKota0GlobalPrompt();

const firstAppNameDraft = ref("");
const firstAppCreateBusy = ref(false);

async function onFirstAppGateSubmit() {
  const name = firstAppNameDraft.value.trim();
  if (!name || firstAppCreateBusy.value) return;
  firstAppCreateBusy.value = true;
  try {
    const ok = await createNewApp(name);
    if (ok) {
      await load({ force: true });
    }
  } finally {
    firstAppCreateBusy.value = false;
  }
}

onMounted(() => {
  void (async () => {
    try {
      await refresh();
      await applyKota0AppFromQuery(route, router, apps, selectApp);
    } finally {
      workspaceReady.value = true;
    }
  })();
});

async function onApplyCode() {
  const ok = await apply();
  if (ok) chatRefreshKey.value += 1;
}

async function onNewApp() {
  const ok = await createNewApp();
  if (ok) {
    await load({ force: true });
  }
}

function onDeleteApp() {
  const id = activeAppId.value;
  if (!id || apps.value.length === 0 || deletionUndoPending.value) return;
  scheduleRemoveApp(id);
}

async function onDuplicateApp(sourceAppId: string) {
  const ok = await duplicateApp(sourceAppId);
  if (ok) {
    await load({ force: true });
  }
}

function isActive(id: string) {
  return activeAppId.value === id;
}

const { editingAppId, editingNameDraft, beginEdit, cancelEdit, commitEdit } =
  useKota0AppEditor(renameApp);

function onAppRowClick(a: Kota0AppRowVm) {
  if (a.pending) return;
  if (editingAppId.value === a.app_id) return;
  selectApp(a.app_id);
}

function onAppRowKeydown(a: Kota0AppRowVm, e: KeyboardEvent) {
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
    class="k0-workspace-root flex h-dvh min-h-0 flex-col bg-background text-foreground antialiased selection:bg-blue-500/30 selection:text-white"
  >
    <Kota0Shell
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

    <Kota0FirstAppGate
      v-else-if="workspaceReady && apps.length === 0 && !deletionUndoPending"
      v-model="firstAppNameDraft"
      :loading="appsLoading"
      :busy="firstAppCreateBusy"
      :error="appsError"
      @submit="onFirstAppGateSubmit"
    />

    <Transition v-else name="k0-workspace-reveal">
      <div class="k0-workspace-main flex min-h-0 flex-1 flex-col">
        <Kota0WorkspaceLayout :grid-template="kota0MdGridTemplate">
          <template #rail>
            <Kota0AppsRail
              v-model:editing-name-draft="editingNameDraft"
              :app-rail-open="appRailOpen"
              :apps="displayApps"
              :deletion-undo-pending="deletionUndoPending"
              :apps-loading="appsLoading"
              :rename-busy="renameBusy"
              :active-app-id="activeAppId"
              :editing-app-id="editingAppId"
              :kota0-app-row-icon="kota0AppRowIcon"
              :resolved-kota0-app-icon-id="resolvedKota0AppIconId"
              :is-active="isActive"
              @toggle-rail="toggleAppRail"
              @click-row="onAppRowClick"
              @keydown-row="(a, e) => onAppRowKeydown(a, e)"
              @begin-edit="beginEdit"
              @commit-edit="(a) => void commitEdit(a)"
              @cancel-edit="cancelEdit"
              @new-app="onNewApp"
              @delete-app="onDeleteApp"
              @duplicate-app="(id) => void onDuplicateApp(id)"
            />
          </template>
          <template #ai>
            <Kota0AiDock
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
            <Kota0WorkspaceViewer
              v-model:active-tab="activeTab"
              v-model:source="source"
              v-model:backend-source="backendSource"
              v-model:bundle-env="bundleEnv"
              :preview-page-url="previewPageUrl"
              :creating-new-app="creatingNewApp"
              :preview-starting="previewStarting"
              :bundle-phase="bundlePhase"
              :last-build-error="lastBuildError"
              :loading="loading"
              :source-applying="sourceApplying"
              :dirty="dirty"
              :error="error"
              :active-app-id="activeAppId"
              @apply-code="onApplyCode"
              @start-preview="startPreview"
            />
          </template>
        </Kota0WorkspaceLayout>

        <Kota0GlobalPromptBar
          ref="globalPromptBarRef"
          v-model="globalPromptOpen"
          :controller="promptController"
        />
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped src="./kota0.style.scss"></style>

<style lang="scss">
/* Transition classes are injected without scoped `data-v-*`; keep this block unscoped so fade completes. */
.k0-workspace-root .k0-workspace-reveal-enter-active,
.k0-workspace-root .k0-workspace-reveal-leave-active {
  transition: opacity 0.28s ease-out;
}

.k0-workspace-root .k0-workspace-reveal-enter-from,
.k0-workspace-root .k0-workspace-reveal-leave-to {
  opacity: 0;
}

.k0-workspace-root .k0-workspace-reveal-enter-to,
.k0-workspace-root .k0-workspace-reveal-leave-from {
  opacity: 1;
}
</style>
