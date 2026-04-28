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
import NvibeAiDock from "@/components/nvibe/ai/NvibeAiDock.vue";
import NvibeAppsRail from "@/components/nvibe/apps/NvibeAppsRail.vue";
import { defaultNvibeAppIconId, isNvibeAppIconId } from "@/components/nvibe/apps/nvibeAppIconIds";
import { applyNvibeAppFromQuery } from "@/components/nvibe/apps/useNvibeAppQueryParam";
import { useNvibeAiPanelResize } from "@/components/nvibe/apps/useNvibeAiPanelResize";
import { useNvibeWorkspaceChrome } from "@/components/nvibe/apps/useNvibeWorkspaceChrome";
import type { NvibeAppSummary } from "@/components/nvibe/apps/nvibeAppTypes";
import { useNvibeApps } from "@/components/nvibe/apps/useNvibeApps";
import NvibeWorkspaceLayout from "@/components/nvibe/NvibeWorkspaceLayout.vue";
import NvibeShell from "@/components/nvibe/shell/NvibeShell.vue";
import NvibeWorkspaceViewer from "@/components/nvibe/viewer/NvibeWorkspaceViewer.vue";
import { useNvibeGeneratedApp } from "@/components/nvibe/viewer/useNvibeGeneratedApp";

/** Keep keys in sync with `nvibeAppIconIds.ts` (`NVIBE_APP_ICON_IDS`). */
const nvibeAppIconById: Record<string, Component> = {
  "squares-2x2": Squares2X2Icon,
  cube: CubeIcon,
  sparkles: SparklesIcon,
  bolt: BoltIcon,
  "rectangle-stack": RectangleStackIcon,
  "circle-stack": CircleStackIcon,
  window: WindowIcon,
  "chart-bar": ChartBarIcon,
};

function nvibeAppRowIcon(iconId: string): Component {
  return nvibeAppIconById[iconId] ?? Squares2X2Icon;
}

/** API may omit `app_icon` on older workers; Scribe may hold unknown strings — always resolve to an allowlisted id. */
function resolvedNvibeAppIconId(a: NvibeAppSummary): string {
  const raw = a.app_icon;
  if (typeof raw === "string" && isNvibeAppIconId(raw.trim())) return raw.trim();
  return defaultNvibeAppIconId(a.app_id);
}

const route = useRoute();
const router = useRouter();
const activeTab = ref<"preview" | "code">("preview");

const { appRailOpen, aiPanelOpen, toggleAppRail, toggleAiPanel } = useNvibeWorkspaceChrome();

const {
  nvibeMdGridTemplate,
  onAiPanelResizePointerDown,
  onAiPanelResizePointerMove,
  endAiPanelResizeDrag,
  nudgeAiPanelWidth: nudgePanelWidth,
  resetAiPanelWidth: resetPanelWidth,
} = useNvibeAiPanelResize(appRailOpen, aiPanelOpen);

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

const {
  source,
  backendSource,
  loading,
  applying: sourceApplying,
  error,
  dirty,
  previewPageUrl,
  load,
  apply,
} = useNvibeGeneratedApp(() => activeAppId.value);

/** Bumped after Code tab **Apply** so AI panel reloads chat (system row from Scribe). */
const chatRefreshKey = ref(0);

onMounted(() => {
  void (async () => {
    await ensureAtLeastOneApp();
    await applyNvibeAppFromQuery(route, router, apps, selectApp);
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

function isActive(id: string) {
  return activeAppId.value === id;
}

const editingAppId = ref<string | null>(null);
const editingNameDraft = ref("");

function beginEdit(a: NvibeAppSummary) {
  editingAppId.value = a.app_id;
  editingNameDraft.value = a.name;
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

function goHome() {
  void router.push({ name: "home" });
}
</script>

<template>
  <div
    class="nvibe-workspace-root flex h-dvh min-h-0 flex-col bg-background text-foreground antialiased selection:bg-blue-500/30 selection:text-white"
  >
    <NvibeShell
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

    <NvibeWorkspaceLayout :grid-template="nvibeMdGridTemplate">
      <template #rail>
        <NvibeAppsRail
          v-model:editing-name-draft="editingNameDraft"
          :app-rail-open="appRailOpen"
          :apps="apps"
          :apps-loading="appsLoading"
          :rename-busy="renameBusy"
          :active-app-id="activeAppId"
          :editing-app-id="editingAppId"
          :nvibe-app-row-icon="nvibeAppRowIcon"
          :resolved-nvibe-app-icon-id="resolvedNvibeAppIconId"
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
        <NvibeAiDock
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
        <NvibeWorkspaceViewer
          v-model:active-tab="activeTab"
          v-model:source="source"
          v-model:backend-source="backendSource"
          :preview-page-url="previewPageUrl"
          :loading="loading"
          :source-applying="sourceApplying"
          :dirty="dirty"
          :error="error"
          :active-app-id="activeAppId"
          @apply-code="onApplyCode"
        />
      </template>
    </NvibeWorkspaceLayout>
  </div>
</template>

<style lang="scss" scoped src="./nvibe.style.scss"></style>
