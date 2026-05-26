/**
 * Runtime error bridge for the per-app bundle preview iframe. Hooks `window`
 * error handlers and POSTs structured records back to the workspace so the
 * agent loop's `getRuntimeErrors` tool can read them.
 *
 * Best-effort: we never throw, never block render. If the workspace endpoint
 * is unreachable the bridge silently drops the error — the iframe's own dev
 * console still shows it.
 */

type RuntimeErrorPayload = {
  kind: "error" | "unhandledrejection";
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  column?: number;
  /** ISO timestamp at capture time. */
  at: string;
  url: string;
};

const ENDPOINT_PATH = "runtime-errors";

function appIdFromEnvOrLocation(): string | null {
  // The bundle Flight injects `K0_APP_ID` into `import.meta.env`, but only at
  // build time. Reading from a global window var keeps this file SSR-safe and
  // avoids a vite plugin dependency.
  const w = window as Window & { __K0_APP_ID__?: string };
  if (typeof w.__K0_APP_ID__ === "string" && w.__K0_APP_ID__.length > 0) return w.__K0_APP_ID__;
  // Fallback: workspace serves bundles via a path like `/__k0_bundle/<appId>/…`.
  const m = /\/(__k0_bundle|__k0_deploy)\/([^/]+)\//.exec(window.location.pathname);
  if (m && m[2]) return decodeURIComponent(m[2]);
  return null;
}

function workspaceOriginGuess(): string {
  // The preview is loaded inside an iframe whose `referrer` is the workspace.
  // For same-origin previews (workspace embeds bundle Flight via proxy), just
  // POST relative; for cross-origin previews we fall back to the referrer.
  try {
    if (document.referrer) {
      const u = new URL(document.referrer);
      return `${u.protocol}//${u.host}`;
    }
  } catch {
    /* ignore */
  }
  return "";
}

function send(appId: string, payload: RuntimeErrorPayload): void {
  const origin = workspaceOriginGuess();
  const url = `${origin}/api/kota0/apps/${encodeURIComponent(appId)}/${ENDPOINT_PATH}`;
  const body = JSON.stringify(payload);
  try {
    // sendBeacon survives page unload; fetch fallback if sendBeacon unavailable.
    const beacon = navigator.sendBeacon?.bind(navigator);
    if (beacon) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = beacon(url, blob);
      if (ok) return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* swallow — bridge is best-effort */
    });
  } catch {
    /* swallow */
  }
}

function installErrorBridge(): void {
  const appId = appIdFromEnvOrLocation();
  if (!appId) return;

  window.addEventListener("error", (e: ErrorEvent) => {
    const msg = e.message || (e.error instanceof Error ? e.error.message : "Uncaught error");
    send(appId, {
      kind: "error",
      message: msg,
      stack: e.error instanceof Error ? e.error.stack : undefined,
      source: e.filename || undefined,
      line: typeof e.lineno === "number" ? e.lineno : undefined,
      column: typeof e.colno === "number" ? e.colno : undefined,
      at: new Date().toISOString(),
      url: window.location.href,
    });
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    const message =
      reason instanceof Error ? reason.message
      : typeof reason === "string" ? reason
      : (() => {
          try {
            return JSON.stringify(reason);
          } catch {
            return "Unhandled promise rejection";
          }
        })();
    send(appId, {
      kind: "unhandledrejection",
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      at: new Date().toISOString(),
      url: window.location.href,
    });
  });
}

installErrorBridge();
