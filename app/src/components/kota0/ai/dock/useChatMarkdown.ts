/**
 * Chat markdown rendering + code-fence detection — one concern (presentation).
 *
 * Pure render/detect helpers with no app state: Shiki-highlighted markdown, fence
 * detection, and plan-envelope decoding. Composed by `usePromptController`.
 */
import { onMounted, ref } from "vue";
import { initShikiChatMarkdown, renderChatMarkdown } from "@/lib/renderChatMarkdown";
import { stripLegacyChatSections } from "@/components/kota0/ai/chat/chatDisplay";
import { extractTsFenceFromMarkdown } from "@/components/kota0/ai/patch/extractBackendFence";
import { extractVueFenceFromMarkdown } from "@/components/kota0/ai/patch/extractVueFence";
import type { PlanEnvelope } from "@/components/kota0/apps/data/appApi";

export function useChatMarkdown() {
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
    return renderChatMarkdown(stripLegacyChatSections(content));
  }

  /** Decode a `kind:"plan"` chat row's `content` (JSON envelope) for UI rendering. */
  function parsePlanContent(content: string): PlanEnvelope | null {
    try {
      const raw = JSON.parse(content) as unknown;
      if (!raw || typeof raw !== "object") return null;
      const o = raw as Partial<PlanEnvelope>;
      if (typeof o.intent !== "string" || !Array.isArray(o.changes)) return null;
      return raw as PlanEnvelope;
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
