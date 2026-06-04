import { ref } from "vue";

export type AiToastVariant = "info" | "error";

export type AiToastItem = {
  id: number;
  message: string;
  variant: AiToastVariant;
  persistent: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

let toastSeq = 0;

/** Shared toast list — all callers use the same queue (dock renders via `useAiToast`). */
const items = ref<AiToastItem[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismissToast(id: number): void {
  const t = timers.get(id);
  if (t !== undefined) clearTimeout(t);
  timers.delete(id);
  items.value = items.value.filter((x) => x.id !== id);
}

export function pushToast(opts: {
  message: string;
  variant?: AiToastVariant;
  persistent?: boolean;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
}): number {
  const id = ++toastSeq;
  const variant = opts.variant ?? "info";
  const persistent = opts.persistent ?? false;
  items.value = [
    ...items.value,
    {
      id,
      message: opts.message,
      variant,
      persistent,
      actionLabel: opts.actionLabel,
      onAction: opts.onAction,
    },
  ];
  if (!persistent) {
    const ms = opts.durationMs ?? 2800;
    timers.set(
      id,
      setTimeout(() => dismissToast(id), ms),
    );
  }
  return id;
}

export function dismissAllToasts(): void {
  for (const id of [...items.value.map((x) => x.id)]) dismissToast(id);
}

export function useAiToast() {
  return {
    items,
    pushToast: pushToast,
    dismiss: dismissToast,
    dismissAll: dismissAllToasts,
  };
}
