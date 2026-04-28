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
import Kota0AiDock from "@/components/kota0/ai/Kota0AiDock.vue";
import Kota0AppsRail from "@/components/kota0/apps/Kota0AppsRail.vue";
import { defaultKota0AppIconId, isKota0AppIconId } from "@/components/kota0/apps/kota0AppIconIds";
import { applyKota0AppFromQuery } from "@/components/kota0/apps/useKota0AppQueryParam";
import { useKota0AiPanelResize } from "@/components/kota0/apps/useKota0AiPanelResize";
import { useKota0WorkspaceChrome } from "@/components/kota0/apps/useKota0WorkspaceChrome";
import type { Kota0AppSummary } from "@/components/kota0/apps/kota0AppTypes";
import { useKota0Apps } from "@/components/kota0/apps/useKota0Apps";
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
function resolvedKota0AppIconId(a: Kota0AppSummary): string {
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
  activeAppId,
  loading: appsLoading,
  error: appsError,
  renameBusy,
  ensureAtLeastOneApp,
  selectApp,
  renameApp,
  createNewApp,
  removeApp,
} = useKota0Apps();

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
} = useKota0GeneratedApp(() => activeAppId.value);

/** Bumped after Code tab **Apply** so AI panel reloads chat (system row from Scribe). */
const chatRefreshKey = ref(0);

onMounted(() => {
  void (async () => {
    await ensureAtLeastOneApp();
    await applyKota0AppFromQuery(route, router, apps, selectApp);
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

function beginEdit(a: Kota0AppSummary) {
  editingAppId.value = a.app_id;
  editingNameDraft.value = a.name;
}

function cancelEdit() {
  editingAppId.value = null;
  editingNameDraft.value = "";
}

async function commitEdit(a: Kota0AppSummary) {
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

function onAppRowClick(a: Kota0AppSummary) {
  if (editingAppId.value === a.app_id) return;
  selectApp(a.app_id);
}

function onAppRowKeydown(a: Kota0AppSummary, e: KeyboardEvent) {
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
    class="kota0-workspace-root flex h-dvh min-h-0 flex-col bg-background text-foreground antialiased selection:bg-blue-500/30 selection:text-white"
  >
    <Kota0Shell
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

    <Kota0WorkspaceLayout :grid-template="kota0MdGridTemplate">
      <template #rail>
        <Kota0AppsRail
          v-model:editing-name-draft="editingNameDraft"
          :app-rail-open="appRailOpen"
          :apps="apps"
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
        />
      </template>
      <template #ai>
        <Kota0AiDock
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
        <Kota0WorkspaceViewer
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
    </Kota0WorkspaceLayout>
  </div>
</template>

<style lang="scss" scoped src="./kota0.style.scss"></style>
