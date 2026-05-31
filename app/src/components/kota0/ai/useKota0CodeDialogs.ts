/**
 * Code-dialog state + persistence — one concern.
 *
 * Owns the "open a fenced ```vue / ```ts block from chat in a modal, edit, and
 * Apply it" flow: dialog open state, drafts, validation, and the PUT/PATCH that
 * persists an edited SFC / backend. Composed by `useKota0PromptController`.
 */
import { computed, ref, watch } from "vue";
import {
  fetchKota0App,
  patchKota0App,
  putKota0App,
} from "@/components/kota0/apps/kota0AppApi";
import { extractTsFenceFromMarkdown } from "@/components/kota0/ai/kota0ExtractBackendFence";
import { extractVueFenceFromMarkdown } from "@/components/kota0/ai/kota0ExtractVueFence";
import { isValidKota0AppSfc } from "@/components/kota0/viewer/kota0SfcQuickCheck";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";

export type Kota0AppliedPayload = { bundleFingerprint?: string };

export type Kota0CodeDialogsOptions = {
  activeId: () => string | null;
  /** Reset the SFC draft override whenever a new assistant turn lands. */
  lastAssistantMessage: () => string | null;
  onApplied: (payload?: Kota0AppliedPayload) => void;
};

export function useKota0CodeDialogs(opts: Kota0CodeDialogsOptions) {
  const draftSfcOverride = ref<string | null>(null);
  const codeModalDraft = ref("");
  const backendModalDraft = ref("");
  const vueDialogOpen = ref(false);
  const backendDialogOpen = ref(false);
  const applyError = ref<string | null>(null);
  const applying = ref(false);

  const activeAppId = computed(() => opts.activeId());

  watch(
    () => opts.lastAssistantMessage(),
    () => {
      draftSfcOverride.value = null;
    },
  );

  watch(activeAppId, () => {
    draftSfcOverride.value = null;
    vueDialogOpen.value = false;
    backendDialogOpen.value = false;
  });

  function openCodeDialogFromMessage(content: string): void {
    const fence = extractVueFenceFromMarkdown(content);
    if (!fence) return;
    codeModalDraft.value = fence;
    vueDialogOpen.value = true;
  }

  function openBackendDialogFromMessage(content: string): void {
    const fence = extractTsFenceFromMarkdown(content);
    if (!fence) return;
    backendModalDraft.value = fence;
    backendDialogOpen.value = true;
  }

  function closeCodeDialog(): void {
    vueDialogOpen.value = false;
  }

  function closeBackendDialog(): void {
    backendDialogOpen.value = false;
  }

  function onChatMarkdownClick(e: MouseEvent, m: ChatMessage): void {
    const t = e.target as HTMLElement | null;
    if (!t?.closest("pre")) return;
    const c = m.content;
    if (extractVueFenceFromMarkdown(c)) {
      e.preventDefault();
      openCodeDialogFromMessage(c);
      return;
    }
    if (extractTsFenceFromMarkdown(c)) {
      e.preventDefault();
      openBackendDialogFromMessage(c);
    }
  }

  function saveDraftFromDialog(): void {
    const s = codeModalDraft.value.trim();
    if (!isValidKota0AppSfc(s)) {
      applyError.value = "That isn’t a valid App.vue SFC yet (fix errors, then try again).";
      return;
    }
    applyError.value = null;
    draftSfcOverride.value = s;
    closeCodeDialog();
  }

  async function persistSfcFromDialog(): Promise<void> {
    const appId = opts.activeId();
    const s = codeModalDraft.value.trim();
    if (!appId || applying.value) return;
    if (!isValidKota0AppSfc(s)) {
      applyError.value = "That isn’t a valid App.vue SFC yet (fix errors, then try again).";
      return;
    }
    applying.value = true;
    applyError.value = null;
    const cur = await fetchKota0App(appId);
    if (!cur.ok) {
      applying.value = false;
      applyError.value = cur.message;
      return;
    }
    const r = await putKota0App(
      appId,
      { source: s, backendSource: cur.app.backendSource },
      { sourceOrigin: "ai_apply" },
    );
    if (!r.ok) {
      applying.value = false;
      applyError.value = r.message;
      return;
    }
    const pr = await patchKota0App(appId, { status: "applied" });
    applying.value = false;
    if (!pr.ok) {
      applyError.value = pr.message;
      return;
    }
    draftSfcOverride.value = null;
    closeCodeDialog();
    opts.onApplied({ bundleFingerprint: r.data.bundleFingerprint });
  }

  async function persistBackendFromDialog(): Promise<void> {
    const appId = opts.activeId();
    const s = backendModalDraft.value.trim();
    if (!appId || applying.value) return;
    if (!s) {
      applyError.value = "App.backend.ts cannot be empty.";
      return;
    }
    applying.value = true;
    applyError.value = null;
    const cur = await fetchKota0App(appId);
    if (!cur.ok) {
      applying.value = false;
      applyError.value = cur.message;
      return;
    }
    const r = await putKota0App(
      appId,
      { source: cur.app.source, backendSource: s },
      { sourceOrigin: "ai_apply" },
    );
    if (!r.ok) {
      applying.value = false;
      applyError.value = r.message;
      return;
    }
    const pr = await patchKota0App(appId, { status: "applied" });
    applying.value = false;
    if (!pr.ok) {
      applyError.value = pr.message;
      return;
    }
    closeBackendDialog();
    opts.onApplied({ bundleFingerprint: r.data.bundleFingerprint });
  }

  return {
    draftSfcOverride,
    codeModalDraft,
    backendModalDraft,
    vueDialogOpen,
    backendDialogOpen,
    applyError,
    applying,
    openCodeDialogFromMessage,
    openBackendDialogFromMessage,
    closeCodeDialog,
    closeBackendDialog,
    onChatMarkdownClick,
    saveDraftFromDialog,
    persistSfcFromDialog,
    persistBackendFromDialog,
  };
}
