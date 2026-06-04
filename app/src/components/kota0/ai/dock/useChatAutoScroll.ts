/**
 * Keep a scroll container pinned to the bottom whenever any of the given sources
 * change (new messages, sending toggles, streamed parts). One concern: autoscroll.
 */
import { nextTick, ref, watch, type WatchSource } from "vue";

export function useChatAutoScroll(sources: WatchSource[]) {
  const listRef = ref<HTMLElement | null>(null);

  async function scrollToBottom(): Promise<void> {
    await nextTick();
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  }

  for (const src of sources) {
    watch(src, () => void scrollToBottom(), { deep: true });
  }

  return { listRef, scrollToBottom };
}
