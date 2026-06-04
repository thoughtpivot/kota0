/**
 * Retry helper for mutating tools the agent loop invokes. Used to absorb
 * transient infra hiccups (Docker daemon coming up, kernel still releasing a
 * port, brief filesystem locks) so the model doesn't have to detect + retry
 * those itself.
 *
 * Conservative by design: only retries when the error message matches a known
 * transient pattern. Logical failures (patch didn't apply, plan-kind mismatch,
 * SFC parse error) must bubble unchanged so the model can reason about them.
 */

export type TransientCheck = (err: unknown) => boolean;

export type WithRetryOptions = {
  /** Max attempts including the first. `attempts: 3` means initial + 2 retries. */
  attempts: number;
  /** Base delay before the first retry; doubled per attempt. */
  baseDelayMs: number;
  /** Returns true when the error is transient and the call should be retried. */
  isTransient: TransientCheck;
  /** Optional: called before each retry so callers can record a step. */
  onRetry?: (info: { attempt: number; attemptsRemaining: number; err: unknown }) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Patterns the bundle runner / docker / fs commonly emit for transient failures. */
const TRANSIENT_PATTERNS: RegExp[] = [
  /EADDRINUSE/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /ECONNRESET/i,
  /EBUSY/i,
  /EAGAIN/i,
  /Cannot connect to the Docker daemon/i,
  /docker daemon/i,
  /port .* is already in use/i,
  /Flight failed to bind/i,
];

/**
 * Default transient classifier for kota0 mutating tools. Conservative — only
 * matches obvious infra-level transients. Wrap your own classifier on top if
 * you need to add domain-specific patterns.
 */
export function defaultIsTransient(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message
    : typeof err === "string" ? err
    : "";
  if (!msg) return false;
  for (const re of TRANSIENT_PATTERNS) {
    if (re.test(msg)) return true;
  }
  return false;
}

/**
 * Run `fn` with retry-on-transient semantics. Returns the resolved value of the
 * first successful call. Throws the last error after `attempts` failures, or
 * immediately on the first non-transient error.
 *
 * Backoff: `baseDelayMs * 2^(attempt-1)`. With `baseDelayMs=500` and
 * `attempts=3` the delays are 500ms then 1000ms.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: WithRetryOptions): Promise<T> {
  const attempts = Math.max(1, Math.floor(opts.attempts));
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt >= attempts) break;
      if (!opts.isTransient(e)) break;
      const delay = opts.baseDelayMs * Math.pow(2, attempt - 1);
      if (opts.onRetry) {
        opts.onRetry({
          attempt,
          attemptsRemaining: attempts - attempt,
          err: e,
        });
      }
      await sleep(delay);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Short error summary for step recording — handy for the live tool-call trace. */
export function shortErrorSummary(err: unknown): string {
  const msg =
    err instanceof Error ? err.message
    : typeof err === "string" ? err
    : "unknown error";
  if (msg.length <= 120) return msg;
  return msg.slice(0, 120) + "…";
}
