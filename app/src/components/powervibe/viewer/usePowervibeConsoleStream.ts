import { onUnmounted, ref, watch, type MaybeRefOrGetter, toValue } from "vue";

export type FlightConsoleLine = {
  stream: "stdout" | "stderr";
  text: string;
  at?: number;
};

/** Same-origin dev proxy path; production may set `VITE_KOA_ORIGIN`. */
function resolveConsoleStreamUrl(): string {
  const explicit = (import.meta.env.VITE_KOA_ORIGIN as string | undefined)?.trim();
  if (explicit) {
    return `${explicit.replace(/\/$/, "")}/api/powervibe/console/stream`;
  }
  return "/api/powervibe/console/stream";
}

const UI_MAX_LINES = 8000;

/**
 * Subscribe to bundle Flight console SSE while `enabled` is true.
 * Opens/closes {@link EventSource} when toggling the Console tab.
 */
export function usePowervibeConsoleStream(enabled: MaybeRefOrGetter<boolean>) {
  const lines = ref<FlightConsoleLine[]>([]);
  let es: EventSource | null = null;

  function stop(): void {
    es?.close();
    es = null;
  }

  function start(): void {
    stop();
    lines.value = [];
    const source = new EventSource(resolveConsoleStreamUrl());
    es = source;
    source.onmessage = (ev: MessageEvent) => {
      try {
        const o = JSON.parse(ev.data as string) as {
          type?: string;
          stream?: string;
          text?: string;
          at?: number;
        };
        if (
          o.type === "line" &&
          (o.stream === "stdout" || o.stream === "stderr") &&
          typeof o.text === "string"
        ) {
          lines.value.push({
            stream: o.stream,
            text: o.text,
            at: o.at,
          });
          if (lines.value.length > UI_MAX_LINES) {
            lines.value.splice(0, lines.value.length - UI_MAX_LINES);
          }
        }
      } catch {
        /* ignore malformed chunks */
      }
    };
  }

  watch(
    () => toValue(enabled),
    (v) => {
      if (v) start();
      else stop();
    },
    { immediate: true },
  );

  onUnmounted(stop);

  return { lines };
}
