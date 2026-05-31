<script setup lang="ts">
import Kota0PreviewPane from "@/components/kota0/viewer/Kota0PreviewPane.vue";
import Kota0CodePanel from "@/components/kota0/viewer/Kota0CodePanel.vue";
import type {
  Kota0BundleBuildError,
  Kota0BundlePhase,
} from "@/components/kota0/apps/kota0AppApi";

const activeTab = defineModel<"preview" | "code">("activeTab", { required: true });
const source = defineModel<string>("source", { required: true });
const backendSource = defineModel<string>("backendSource", { required: true });
const bundleEnv = defineModel<string>("bundleEnv", { required: true });

defineProps<{
  previewPageUrl: string;
  /** True while POST /apps is in flight — optimistic create row in rail. */
  creatingNewApp: boolean;
  /** True while POST /preview/start + bundle Flight status poll is in flight. */
  previewStarting: boolean;
  loading: boolean;
  sourceApplying: boolean;
  dirty: boolean;
  error: string | null;
  /** Active Scribe app id — bundle path `bundles/<id>/`. */
  activeAppId: string | null;
  /** Live bundle phase polled from /bundle-flight/status — drives the chain-of-thought overlay. */
  bundlePhase?: Kota0BundlePhase;
  /** Last build error from the bundle runner; surfaced in the overlay on failure. */
  lastBuildError?: Kota0BundleBuildError | null;
}>();

const emit = defineEmits<{
  applyCode: [];
  startPreview: [];
}>();
</script>

<template>
  <section
    class="flex min-h-0 min-w-0 flex-[1.65] flex-col border-white/5 bg-[#0B0C10]/80 md:h-full md:min-h-0 md:flex-none md:border-l"
  >
    <div class="flex shrink-0 gap-0.5 border-b border-white/5 bg-[#0F1115]/50 px-2 pt-2">
      <button
        type="button"
        class="rounded-t-md px-3 py-2 text-xs font-medium transition-colors md:text-sm"
        :class="
          activeTab === 'preview'
            ? 'bg-[#0B0C10] text-slate-100 shadow-sm ring-1 ring-inset ring-white/10'
            : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
        "
        @click="activeTab = 'preview'"
      >
        Preview
      </button>
      <button
        type="button"
        class="rounded-t-md px-3 py-2 text-xs font-medium transition-colors md:text-sm"
        :class="
          activeTab === 'code'
            ? 'bg-[#0B0C10] text-slate-100 shadow-sm ring-1 ring-inset ring-white/10'
            : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
        "
        @click="activeTab = 'code'"
      >
        Code
      </button>
    </div>

    <div class="relative min-h-[min(55vh,560px)] flex-1 bg-[#0a0b0e] md:min-h-0">
      <Kota0PreviewPane
        v-show="activeTab === 'preview'"
        :preview-page-url="previewPageUrl"
        :preview-starting="previewStarting"
        :creating-new-app="creatingNewApp"
        :active-app-id="activeAppId"
        :bundle-phase="bundlePhase"
        :last-build-error="lastBuildError"
        :error="error"
      />
      <Kota0CodePanel
        v-show="activeTab === 'code'"
        :active="activeTab === 'code'"
        v-model:source="source"
        v-model:backend-source="backendSource"
        v-model:bundle-env="bundleEnv"
        :loading="loading"
        :source-applying="sourceApplying"
        :dirty="dirty"
        :error="error"
        :active-app-id="activeAppId"
        @apply-code="emit('applyCode')"
      />
    </div>
  </section>
</template>
