import { ref } from "vue";

export type Kota0AiToastVariant = "info" | "error";

export type Kota0AiToastItem = {
  id: number;
  message: string;
  variant: Kota0AiToastVariant;
  persistent: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

let toastSeq = 0;

/** Shared toast list — all callers use the same queue (dock renders via `useKota0AiToast`). */
const items = ref<Kota0AiToastItem[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismissKota0Toast(id: number): void {
  const t = timers.get(id);
  if (t !== undefined) clearTimeout(t);
  timers.delete(id);
  items.value = items.value.filter((x) => x.id !== id);
}

export function pushKota0Toast(opts: {
  message: string;
  variant?: Kota0AiToastVariant;
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
      setTimeout(() => dismissKota0Toast(id), ms),
    );
  }
  return id;
}

export function dismissAllKota0Toasts(): void {
  for (const id of [...items.value.map((x) => x.id)]) dismissKota0Toast(id);
}

export function useKota0AiToast() {
  return {
    items,
    pushToast: pushKota0Toast,
    dismiss: dismissKota0Toast,
    dismissAll: dismissAllKota0Toasts,
  };
}
