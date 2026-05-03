<script setup lang="ts">
import { ChevronLeft } from "lucide-vue-next";
import { inject, nextTick, ref, toRef, watch } from "vue";
import PowervibeSourceEditor from "@/components/powervibe/viewer/PowervibeSourceEditor.vue";
import PowervibeChatComposer from "@/components/powervibe/ai/PowervibeChatComposer.vue";
import PowervibePromptMessages from "@/components/powervibe/ai/PowervibePromptMessages.vue";
import {
  POWERVIBE_PROMPT_CONTROLLER,
  type PowervibePromptController,
} from "@/components/powervibe/ai/usePowervibePromptController";

const emit = defineEmits<{
  collapsePanel: [];
}>();

const ctrlInjected = inject(POWERVIBE_PROMPT_CONTROLLER);
if (!ctrlInjected) throw new Error("PromptPanel requires POWERVIBE_PROMPT_CONTROLLER");

const ctrl = ctrlInjected as PowervibePromptController;

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
          <button
            type="button"
            class="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-[#3B82F6] px-3 text-xs font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!ctrl.canApplyFromAi || !ctrl.activeAppId || ctrl.applying"
            @click="ctrl.applyFromAi"
          >
            {{ ctrl.applying ? "Applying…" : "Apply" }}
          </button>
        </div>
      </div>
      <p v-if="ctrl.applyError" class="mt-1 text-xs text-destructive">{{ ctrl.applyError }}</p>
      <p v-if="ctrl.chatError" class="mt-1 text-xs text-destructive">{{ ctrl.chatError }}</p>
      <p v-if="ctrl.loading && ctrl.activeAppId" class="mt-1 text-xs text-muted-foreground">Loading…</p>
    </div>

    <PowervibePromptMessages />

    <Teleport to="body">
      <dialog
        ref="codeDlg"
        class="powervibe-code-expand-dialog fixed left-1/2 top-1/2 z-[400] max-h-[92vh] w-[min(96vw,72rem)] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background p-0 text-foreground shadow-2xl outline-none [open]:flex"
        @close="ctrl.closeCodeDialog"
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p class="text-sm font-medium">App.vue</p>
          <button type="button" class="btn btn-ghost btn-sm" @click="ctrl.closeCodeDialog">Close</button>
        </div>
        <div class="min-h-0 flex-1 px-3 pb-2 pt-2" style="height: min(62vh, 640px)">
          <PowervibeSourceEditor v-model="ctrl.codeModalDraft" class="h-full min-h-0" language="sfc" />
        </div>
        <div class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button type="button" class="btn btn-outline btn-sm" @click="ctrl.closeCodeDialog">Cancel</button>
          <button type="button" class="btn btn-outline btn-sm" @click="ctrl.saveDraftFromDialog">Use for Apply</button>
          <button
            type="button"
            class="inline-flex h-8 items-center justify-center rounded-md bg-[#3B82F6] px-3 text-xs font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!ctrl.activeAppId || ctrl.applying"
            @click="ctrl.persistSfcFromDialog"
          >
            {{ ctrl.applying ? "Applying…" : "Apply now" }}
          </button>
        </div>
      </dialog>
    </Teleport>

    <Teleport to="body">
      <dialog
        ref="backendDlg"
        class="powervibe-code-expand-dialog fixed left-1/2 top-1/2 z-[400] max-h-[92vh] w-[min(96vw,72rem)] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background p-0 text-foreground shadow-2xl outline-none [open]:flex"
        @close="ctrl.closeBackendDialog"
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p class="text-sm font-medium">App.backend.ts</p>
          <button type="button" class="btn btn-ghost btn-sm" @click="ctrl.closeBackendDialog">Close</button>
        </div>
        <div class="min-h-0 flex-1 px-3 pb-2 pt-2" style="height: min(62vh, 640px)">
          <PowervibeSourceEditor v-model="ctrl.backendModalDraft" class="h-full min-h-0" language="ts" />
        </div>
        <div class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button type="button" class="btn btn-outline btn-sm" @click="ctrl.closeBackendDialog">Cancel</button>
          <button
            type="button"
            class="inline-flex h-8 items-center justify-center rounded-md bg-[#3B82F6] px-3 text-xs font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!ctrl.activeAppId || ctrl.applying"
            @click="ctrl.persistBackendFromDialog"
          >
            {{ ctrl.applying ? "Applying…" : "Apply now" }}
          </button>
        </div>
      </dialog>
    </Teleport>

    <div class="shrink-0 border-t border-border p-3">
      <PowervibeChatComposer
        :disabled="!ctrl.canSend || !ctrl.activeAppId"
        :sending="ctrl.sending"
        @submit="ctrl.onComposerSubmit"
      />
    </div>
  </div>
</template>

<style>
/* `::backdrop` must be unscoped */
.powervibe-code-expand-dialog::backdrop {
  background: rgba(15, 23, 42, 0.55);
}
</style>
