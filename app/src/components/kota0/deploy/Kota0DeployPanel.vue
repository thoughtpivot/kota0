<script setup lang="ts">
import { ref, watch } from "vue";
import { Rocket, Trash2 } from "lucide-vue-next";
import {
  deleteKota0Deployment,
  fetchKota0Deployments,
  postKota0Deploy,
} from "@/components/kota0/deploy/kota0DeployApi";
import type { Kota0DeploymentRow, Kota0DeploymentStatus } from "@/components/kota0/deploy/kota0DeploymentTypes";
import { K0_DEPLOY_PROXY_PREFIX } from "@/components/kota0/viewer/kota0BundlePreviewConstants";

/**
 * User-facing URL for a running deployment. We never link to `endpoint_url` directly
 * (that's `http://127.0.0.1:<port>`, only reachable from inside the workspace VM).
 * Instead we point at the workspace's same-origin reverse-proxy path served by
 * `Kota0DeployProxy.backend.ts`.
 */
function deployBrowserUrl(deploymentId: string): string {
  return `${K0_DEPLOY_PROXY_PREFIX}/${deploymentId}/`;
}

const props = defineProps<{ appId: string | null }>();

const deployments = ref<Kota0DeploymentRow[]>([]);
const loadError = ref<string | null>(null);
const deploying = ref(false);
const deployError = ref<string | null>(null);
const destroyInFlight = ref<Set<string>>(new Set());

async function refresh(appId: string): Promise<void> {
  loadError.value = null;
  const res = await fetchKota0Deployments(appId);
  if (res.ok) {
    deployments.value = res.deployments;
  } else {
    loadError.value = res.message;
  }
}

watch(
  () => props.appId,
  async (id) => {
    deployments.value = [];
    deployError.value = null;
    if (id) await refresh(id);
  },
  { immediate: true },
);

async function onDeploy(): Promise<void> {
  if (!props.appId || deploying.value) return;
  deploying.value = true;
  deployError.value = null;
  try {
    const res = await postKota0Deploy(props.appId);
    if (!res.ok) {
      deployError.value = res.message;
    }
    await refresh(props.appId);
  } finally {
    deploying.value = false;
  }
}

async function onDestroy(deploymentId: string): Promise<void> {
  if (destroyInFlight.value.has(deploymentId)) return;
  destroyInFlight.value.add(deploymentId);
  try {
    const res = await deleteKota0Deployment(deploymentId);
    if (!res.ok) {
      deployError.value = res.message;
    }
    if (props.appId) await refresh(props.appId);
  } finally {
    destroyInFlight.value.delete(deploymentId);
  }
}

function statusLabel(s: Kota0DeploymentStatus): string {
  switch (s) {
    case "building":
      return "Building…";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "destroyed":
      return "Destroyed";
  }
}

function statusClass(s: Kota0DeploymentStatus): string {
  switch (s) {
    case "building":
      return "text-amber-500";
    case "running":
      return "text-emerald-500";
    case "failed":
      return "text-red-500";
    case "destroyed":
      return "text-muted-foreground";
  }
}

function shortId(id: string): string {
  return id.slice(0, 8);
}
</script>

<template>
  <div class="space-y-2">
    <button
      type="button"
      class="btn btn-sm w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
      :disabled="!appId || deploying"
      @click="onDeploy"
    >
      <Rocket class="size-3.5" />
      {{ deploying ? "Deploying…" : "Deploy" }}
    </button>

    <p v-if="deployError" class="text-xs text-red-500">{{ deployError }}</p>
    <p v-if="loadError" class="text-xs text-red-500">{{ loadError }}</p>

    <div v-if="deployments.length > 0" class="space-y-1.5 rounded-md border border-border bg-card/40 p-2">
      <p class="text-[10px] uppercase tracking-wide text-muted-foreground">Deployments</p>
      <ul class="space-y-1">
        <li
          v-for="d in deployments"
          :key="d.deployment_id"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-mono text-[10px] text-muted-foreground">
              {{ shortId(d.deployment_id) }}
            </span>
            <span :class="['font-medium', statusClass(d.status)]">{{ statusLabel(d.status) }}</span>
            <a
              v-if="d.status === 'running'"
              :href="deployBrowserUrl(d.deployment_id)"
              target="_blank"
              rel="noreferrer"
              class="truncate text-[11px] text-blue-500 hover:underline"
              :title="deployBrowserUrl(d.deployment_id)"
            >
              Open ↗
            </a>
            <span v-if="d.status === 'failed' && d.error" class="truncate text-[11px] text-red-500" :title="d.error">
              {{ d.error }}
            </span>
          </div>
          <button
            v-if="d.status === 'running' || d.status === 'failed'"
            type="button"
            class="btn btn-ghost btn-xs text-destructive hover:bg-destructive/10"
            :disabled="destroyInFlight.has(d.deployment_id)"
            :title="d.status === 'running' ? 'Stop deployment' : 'Discard failed deployment'"
            @click="onDestroy(d.deployment_id)"
          >
            <Trash2 class="size-3" />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
