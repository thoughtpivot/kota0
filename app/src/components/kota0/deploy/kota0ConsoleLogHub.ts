/**
 * In-memory ring buffer + broadcast for bundle Flight stdout/stderr (see {@link restartKota0Bundle}).
 * Consumed by GET `/api/kota0/console/stream` (SSE).
 */

export type FlightConsoleStreamName = "stdout" | "stderr";

export type FlightConsoleEntry = {
  stream: FlightConsoleStreamName;
  /** Single logical line (no trailing newline). */
  text: string;
  at: number;
};

const DEFAULT_MAX_LINES = 2500;

type Subscriber = (entry: FlightConsoleEntry) => void;

const subscribers = new Set<Subscriber>();

/** Incomplete UTF-8 tail per stream (multi-byte char split across chunks). */
const pendingText: Record<FlightConsoleStreamName, string> = {
  stdout: "",
  stderr: "",
};

let lines: FlightConsoleEntry[] = [];
let maxLines = DEFAULT_MAX_LINES;

function trimBuffer(): void {
  while (lines.length > maxLines) {
    lines.shift();
  }
}

function pushLine(stream: FlightConsoleStreamName, text: string): void {
  const entry: FlightConsoleEntry = { stream, text, at: Date.now() };
  lines.push(entry);
  trimBuffer();
  for (const cb of subscribers) {
    try {
      cb(entry);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function appendChunk(stream: FlightConsoleStreamName, chunk: Buffer): void {
  const s = pendingText[stream] + chunk.toString("utf8");
  const parts = s.split(/\r?\n/);
  pendingText[stream] = parts.pop() ?? "";
  for (const line of parts) {
    pushLine(stream, line);
  }
}

function flushPending(stream: FlightConsoleStreamName): void {
  const rest = pendingText[stream];
  if (rest.length > 0) {
    pushLine(stream, rest);
    pendingText[stream] = "";
  }
}

/** Tee optional: duplicate raw chunk to parent TTY (same as previous inherit behavior). */
export function appendFlightRawChunk(
  stream: FlightConsoleStreamName,
  chunk: Buffer,
  options?: { teeToTerminal?: boolean },
): void {
  if (options?.teeToTerminal !== false) {
    if (stream === "stdout") {
      process.stdout.write(chunk);
    } else {
      process.stderr.write(chunk);
    }
  }
  appendChunk(stream, chunk);
}

/** Clear buffered lines and pending tails (call when starting a new bundle Flight session). */
export function clearFlightConsoleBuffer(): void {
  lines = [];
  pendingText.stdout = "";
  pendingText.stderr = "";
}

/** Session delimiter after {@link clearFlightConsoleBuffer}. */
export function appendFlightSessionBanner(appId: string): void {
  pushLine("stdout", `[k0-bundle] Flight session started for app ${appId}`);
}

/** Called when the Flight child exits (after streams end). */
export function appendFlightExitNotice(
  code: number | null,
  signal: NodeJS.Signals | null | undefined,
): void {
  flushPending("stdout");
  flushPending("stderr");
  const sig = signal ? ` signal=${signal}` : "";
  pushLine("stderr", `[k0-bundle] Flight exited with code ${code ?? "null"}${sig}`);
}

export function getFlightConsoleRecent(): FlightConsoleEntry[] {
  return [...lines];
}

export function subscribeFlightConsole(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** For tests or diagnostics. */
export function setFlightConsoleMaxLines(n: number): void {
  maxLines = Math.max(100, Math.min(50_000, Math.floor(n)));
  trimBuffer();
}
