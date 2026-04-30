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
import type { Component } from "vue";
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PowervibeAiDock from "@/components/powervibe/ai/PowervibeAiDock.vue";
import PowervibeAppsRail from "@/components/powervibe/apps/PowervibeAppsRail.vue";
import { defaultPowervibeAppIconId, isPowervibeAppIconId } from "@/components/powervibe/apps/powervibeAppIconIds";
import { invalidatePowervibeAppGetDedupe } from "@/components/powervibe/apps/powervibeAppApi";
import { applyPowervibeAppFromQuery } from "@/components/powervibe/apps/usePowervibeAppQueryParam";
import { usePowervibeAiPanelResize } from "@/components/powervibe/apps/usePowervibeAiPanelResize";
import { usePowervibeWorkspaceChrome } from "@/components/powervibe/apps/usePowervibeWorkspaceChrome";
import type { PowervibeAppSummary } from "@/components/powervibe/apps/powervibeAppTypes";
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
function resolvedPowervibeAppIconId(a: PowervibeAppSummary): string {
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
  activeAppId,
  loading: appsLoading,
  error: appsError,
  renameBusy,
  ensureAtLeastOneApp,
  selectApp,
  renameApp,
  createNewApp,
  removeApp,
} = usePowervibeApps();

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

onMounted(async () => {
  await ensureAtLeastOneApp();
  await applyPowervibeAppFromQuery(route, router, apps, selectApp);
  workspaceReady.value = true;
});

async function onAppliedFromPrompt() {
  const id = activeAppId.value;
  if (id) invalidatePowervibeAppGetDedupe(id);
  await load({ remountPreview: true, force: true });
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

function isActive(id: string) {
  return activeAppId.value === id;
}

const editingAppId = ref<string | null>(null);
const editingNameDraft = ref("");

function beginEdit(a: PowervibeAppSummary) {
  editingAppId.value = a.app_id;
  editingNameDraft.value = a.name;
}

function cancelEdit() {
  editingAppId.value = null;
  editingNameDraft.value = "";
}

async function commitEdit(a: PowervibeAppSummary) {
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

function onAppRowClick(a: PowervibeAppSummary) {
  if (editingAppId.value === a.app_id) return;
  selectApp(a.app_id);
}

function onAppRowKeydown(a: PowervibeAppSummary, e: KeyboardEvent) {
  if (editingAppId.value) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    selectApp(a.app_id);
  }
}

function goHome() {
  void router.push({ name: "home" });
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
      @go-home="goHome"
    />
    <p
      v-if="appsError"
      class="shrink-0 border-b border-rose-500/20 bg-rose-950/30 px-4 py-2 text-xs text-rose-200/90"
    >
      {{ appsError }}
    </p>

    <PowervibeWorkspaceLayout :grid-template="powervibeMdGridTemplate">
      <template #rail>
        <PowervibeAppsRail
          v-model:editing-name-draft="editingNameDraft"
          :app-rail-open="appRailOpen"
          :apps="apps"
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
          :chat-refresh-key="chatRefreshKey"
          @toggle-ai-panel="toggleAiPanel"
          @applied="onAppliedFromPrompt"
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
          :loading="loading"
          :source-applying="sourceApplying"
          :dirty="dirty"
          :error="error"
          :active-app-id="activeAppId"
          @apply-code="onApplyCode"
        />
      </template>
    </PowervibeWorkspaceLayout>
  </div>
</template>

<style lang="scss" scoped src="./powervibe.style.scss"></style>
