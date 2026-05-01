import { ref } from "vue";

export type PowervibeAiToastVariant = "info" | "error";

export type PowervibeAiToastItem = {
  id: number;
  message: string;
  variant: PowervibeAiToastVariant;
  persistent: boolean;
};

let toastSeq = 0;

export function usePowervibeAiToast() {
  const items = ref<PowervibeAiToastItem[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  function dismiss(id: number): void {
    const t = timers.get(id);
    if (t !== undefined) clearTimeout(t);
    timers.delete(id);
    items.value = items.value.filter((x) => x.id !== id);
  }

  function pushToast(opts: {
    message: string;
    variant?: PowervibeAiToastVariant;
    persistent?: boolean;
    durationMs?: number;
  }): number {
    const id = ++toastSeq;
    const variant = opts.variant ?? "info";
    const persistent = opts.persistent ?? false;
    items.value = [...items.value, { id, message: opts.message, variant, persistent }];
    if (!persistent) {
      const ms = opts.durationMs ?? 2800;
      timers.set(
        id,
        setTimeout(() => dismiss(id), ms),
      );
    }
    return id;
  }

  function dismissAll(): void {
    for (const id of [...items.value.map((x) => x.id)]) dismiss(id);
  }

  return { items, pushToast, dismiss, dismissAll };
}
