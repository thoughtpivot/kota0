import { ref } from "vue";

export type PowervibeAiToastVariant = "info" | "error";

export type PowervibeAiToastItem = {
  id: number;
  message: string;
  variant: PowervibeAiToastVariant;
  persistent: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

let toastSeq = 0;

/** Shared toast list — all callers use the same queue (dock renders via `usePowervibeAiToast`). */
const items = ref<PowervibeAiToastItem[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismissPowervibeToast(id: number): void {
  const t = timers.get(id);
  if (t !== undefined) clearTimeout(t);
  timers.delete(id);
  items.value = items.value.filter((x) => x.id !== id);
}

export function pushPowervibeToast(opts: {
  message: string;
  variant?: PowervibeAiToastVariant;
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
      setTimeout(() => dismissPowervibeToast(id), ms),
    );
  }
  return id;
}

export function dismissAllPowervibeToasts(): void {
  for (const id of [...items.value.map((x) => x.id)]) dismissPowervibeToast(id);
}

export function usePowervibeAiToast() {
  return {
    items,
    pushToast: pushPowervibeToast,
    dismiss: dismissPowervibeToast,
    dismissAll: dismissAllPowervibeToasts,
  };
}
