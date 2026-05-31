/**
 * Chat markdown rendering + code-fence detection — one concern (presentation).
 *
 * Pure render/detect helpers with no app state: Shiki-highlighted markdown, fence
 * detection, and plan-envelope decoding. Composed by `useKota0PromptController`.
 */
import { onMounted, ref } from "vue";
import { initShikiChatMarkdown, renderChatMarkdown } from "@/lib/renderChatMarkdown";
import { stripLegacyKota0ChatSections } from "@/components/kota0/ai/kota0ChatDisplay";
import { extractTsFenceFromMarkdown } from "@/components/kota0/ai/kota0ExtractBackendFence";
import { extractVueFenceFromMarkdown } from "@/components/kota0/ai/kota0ExtractVueFence";
import type { Kota0PlanEnvelope } from "@/components/kota0/apps/kota0AppApi";

export function useKota0ChatMarkdown() {
  const shikiReady = ref(false);

  onMounted(() => {
    void initShikiChatMarkdown().then(() => {
      shikiReady.value = true;
    });
  });

  function hasVueFenceInMessage(content: string): boolean {
    return !!extractVueFenceFromMarkdown(content);
  }

  function hasTsFenceInMessage(content: string): boolean {
    return !!extractTsFenceFromMarkdown(content);
  }

  function hasExpandableCodeFenceInMessage(content: string): boolean {
    return hasVueFenceInMessage(content) || hasTsFenceInMessage(content);
  }

  function displayChatMarkdown(content: string): string {
    return renderChatMarkdown(stripLegacyKota0ChatSections(content));
  }

  /** Decode a `kind:"plan"` chat row's `content` (JSON envelope) for UI rendering. */
  function parsePlanContent(content: string): Kota0PlanEnvelope | null {
    try {
      const raw = JSON.parse(content) as unknown;
      if (!raw || typeof raw !== "object") return null;
      const o = raw as Partial<Kota0PlanEnvelope>;
      if (typeof o.intent !== "string" || !Array.isArray(o.changes)) return null;
      return raw as Kota0PlanEnvelope;
    } catch {
      return null;
    }
  }

  return {
    shikiReady,
    hasVueFenceInMessage,
    hasTsFenceInMessage,
    hasExpandableCodeFenceInMessage,
    displayChatMarkdown,
    parsePlanContent,
  };
}
