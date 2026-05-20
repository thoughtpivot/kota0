<script setup lang="ts">
import { ChevronLeft } from "lucide-vue-next";
import { inject, nextTick, ref, toRef, watch } from "vue";
import Kota0SourceEditor from "@/components/kota0/viewer/Kota0SourceEditor.vue";
import Kota0ChatComposer from "@/components/kota0/ai/Kota0ChatComposer.vue";
import Kota0PromptMessages from "@/components/kota0/ai/Kota0PromptMessages.vue";
import Kota0ApplyButton from "@/components/kota0/shared/Kota0ApplyButton.vue";
import {
  K0_PROMPT_CONTROLLER,
  type Kota0PromptController,
} from "@/components/kota0/ai/useKota0PromptController";

const emit = defineEmits<{
  collapsePanel: [];
}>();

const ctrlInjected = inject(K0_PROMPT_CONTROLLER);
if (!ctrlInjected) throw new Error("PromptPanel requires K0_PROMPT_CONTROLLER");

const ctrl = ctrlInjected as Kota0PromptController;

const codeDlg = ref<HTMLDialogElement | null>(null);
const backendDlg = ref<HTMLDialogElement | null>(null);

watch(
  () => ctrl.vueDialogOpen,
  (open) => {
    void nextTick(() => {
      const el = codeDlg.value;
      if (!el) return;
      if (open && !el.open) el.showModal();
      else if (!open && el.open) el.close();
    });
  },
);

watch(
  () => ctrl.backendDialogOpen,
  (open) => {
    void nextTick(() => {
      const el = backendDlg.value;
      if (!el) return;
      if (open && !el.open) el.showModal();
      else if (!open && el.open) el.close();
    });
  },
);

defineExpose({
  sending: toRef(ctrl, "sending"),
  submitUserMessageFromPanel: ctrl.submitUserMessageFromPanel,
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background text-foreground">
    <div class="shrink-0 border-b border-border px-3 py-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1">
          <button
            type="button"
            class="btn btn-ghost btn-square btn-sm size-8 shrink-0 md:hidden"
            aria-label="Hide AI panel"
            @click="emit('collapsePanel')"
          >
            <ChevronLeft class="size-4" />
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-square btn-sm hidden size-8 shrink-0 md:inline-flex"
            aria-label="Hide AI panel"
            @click="emit('collapsePanel')"
          >
            <ChevronLeft class="size-4" />
          </button>
          <label
            class="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground"
            title="After each reply, save vue / backend / secrets proposals to the bundle without clicking Apply."
          >
            <input v-model="ctrl.aiAutoApply" type="checkbox" class="size-3.5 rounded border-border accent-primary" />
            <span>Auto-apply</span>
          </label>
          <Kota0ApplyButton
            :applying="ctrl.applying"
            :disabled="!ctrl.canApplyFromAi || !ctrl.activeAppId"
            @apply="ctrl.applyFromAi"
          />
        </div>
      </div>
      <p v-if="ctrl.applyError" class="mt-1 text-xs text-destructive">{{ ctrl.applyError }}</p>
      <p v-if="ctrl.chatError" class="mt-1 text-xs text-destructive">{{ ctrl.chatError }}</p>
      <p v-if="ctrl.loading && ctrl.activeAppId" class="mt-1 text-xs text-muted-foreground">Loading…</p>
    </div>

    <Kota0PromptMessages />

    <Teleport to="body">
      <dialog
        ref="codeDlg"
        class="k0-code-expand-dialog fixed left-1/2 top-1/2 z-[400] max-h-[92vh] w-[min(96vw,72rem)] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background p-0 text-foreground shadow-2xl outline-none [open]:flex"
        @close="ctrl.closeCodeDialog"
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p class="text-sm font-medium">App.vue</p>
          <button type="button" class="btn btn-ghost btn-sm" @click="ctrl.closeCodeDialog">Close</button>
        </div>
        <div class="min-h-0 flex-1 px-3 pb-2 pt-2" style="height: min(62vh, 640px)">
          <Kota0SourceEditor v-model="ctrl.codeModalDraft" class="h-full min-h-0" language="sfc" />
        </div>
        <div class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button type="button" class="btn btn-outline btn-sm" @click="ctrl.closeCodeDialog">Cancel</button>
          <button type="button" class="btn btn-outline btn-sm" @click="ctrl.saveDraftFromDialog">Use for Apply</button>
          <Kota0ApplyButton
            label="Apply now"
            :applying="ctrl.applying"
            :disabled="!ctrl.activeAppId"
            @apply="ctrl.persistSfcFromDialog"
          />
        </div>
      </dialog>
    </Teleport>

    <Teleport to="body">
      <dialog
        ref="backendDlg"
        class="k0-code-expand-dialog fixed left-1/2 top-1/2 z-[400] max-h-[92vh] w-[min(96vw,72rem)] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background p-0 text-foreground shadow-2xl outline-none [open]:flex"
        @close="ctrl.closeBackendDialog"
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p class="text-sm font-medium">App.backend.ts</p>
          <button type="button" class="btn btn-ghost btn-sm" @click="ctrl.closeBackendDialog">Close</button>
        </div>
        <div class="min-h-0 flex-1 px-3 pb-2 pt-2" style="height: min(62vh, 640px)">
          <Kota0SourceEditor v-model="ctrl.backendModalDraft" class="h-full min-h-0" language="ts" />
        </div>
        <div class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button type="button" class="btn btn-outline btn-sm" @click="ctrl.closeBackendDialog">Cancel</button>
          <Kota0ApplyButton
            label="Apply now"
            :applying="ctrl.applying"
            :disabled="!ctrl.activeAppId"
            @apply="ctrl.persistBackendFromDialog"
          />
        </div>
      </dialog>
    </Teleport>

    <div class="shrink-0 border-t border-border p-3">
      <Kota0ChatComposer
        :disabled="!ctrl.canSend || !ctrl.activeAppId"
        :sending="ctrl.sending"
        @submit="ctrl.onComposerSubmit"
      />
    </div>
  </div>
</template>

<style>
/* `::backdrop` must be unscoped */
.k0-code-expand-dialog::backdrop {
  background: rgba(15, 23, 42, 0.55);
}
</style>
