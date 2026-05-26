/**
 * Parses bundle build/install stderr into structured `BundleBuildError` shapes
 * the agent loop's tools can read. The model needs more than raw stderr —
 * "Rollup failed to resolve import 'leaflet'" is the difference between "try to
 * fix" and "give up." Patterns are conservative: only match shapes we've seen
 * in real failures, fall through to the generic kind otherwise.
 */
import type { BundleBuildError, BundleBuildErrorKind } from "@/components/kota0/deploy/kota0BundleSharedState";

const TAIL_LINE_CAP = 60;

function tailLines(lines: string[]): string[] {
  if (lines.length <= TAIL_LINE_CAP) return lines.slice();
  return lines.slice(lines.length - TAIL_LINE_CAP);
}

/** `Rollup failed to resolve import "leaflet" from "/Users/.../App.vue?vue&type=script…"` */
const ROLLUP_MISSING_IMPORT_RE =
  /Rollup failed to resolve import\s+["'`](.+?)["'`]\s+from\s+["'`](.+?)["'`]/;

/** Vite sometimes wraps the same condition slightly differently. */
const VITE_RESOLVE_FAILED_RE =
  /Could not (?:find|resolve)\s+["'`](.+?)["'`]/;

/** `Cannot find module '<x>'` — generic Node resolution. */
const CANNOT_FIND_MODULE_RE = /Cannot find module\s+["'`](.+?)["'`]/;

/**
 * Parse a vite-build failure's stderr. Returns null when the buffer is empty
 * (caller should still record a generic failure).
 */
export function parseViteBuildError(stderrBuffer: string): BundleBuildError | null {
  const lines = stderrBuffer
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return null;

  const joined = lines.join("\n");

  const rollupMatch = ROLLUP_MISSING_IMPORT_RE.exec(joined);
  if (rollupMatch) {
    return {
      kind: "missing_import",
      message: `Rollup failed to resolve import "${rollupMatch[1]}" from "${rollupMatch[2]}".`,
      module: rollupMatch[1],
      importedFrom: rollupMatch[2],
      rawLines: tailLines(lines),
      at: Date.now(),
    };
  }
  const viteMatch = VITE_RESOLVE_FAILED_RE.exec(joined);
  if (viteMatch) {
    return {
      kind: "missing_import",
      message: `Could not resolve import "${viteMatch[1]}".`,
      module: viteMatch[1],
      rawLines: tailLines(lines),
      at: Date.now(),
    };
  }
  const findMatch = CANNOT_FIND_MODULE_RE.exec(joined);
  if (findMatch) {
    return {
      kind: "missing_import",
      message: `Cannot find module "${findMatch[1]}".`,
      module: findMatch[1],
      rawLines: tailLines(lines),
      at: Date.now(),
    };
  }

  return {
    kind: "vite_build_error",
    message: lines[0] || "vite build failed",
    rawLines: tailLines(lines),
    at: Date.now(),
  };
}

/** Parse an `npm install` failure. Network errors, peer-dep conflicts, registry 404s, etc. */
export function parseNpmInstallError(stderrBuffer: string): BundleBuildError {
  const lines = stderrBuffer
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const joined = lines.join("\n");
  // Common npm "not found" shape: `npm error 404 Not Found - GET https://registry.npmjs.org/<pkg> - Not found`
  const notFoundRe = /404\s+Not Found.*\/([^/\s]+?)(?:\s|$)/i;
  const m = notFoundRe.exec(joined);
  if (m) {
    return {
      kind: "npm_install_error",
      message: `npm registry returned 404 for "${m[1]}" — package likely doesn't exist.`,
      module: m[1],
      rawLines: tailLines(lines),
      at: Date.now(),
    };
  }

  return {
    kind: "npm_install_error",
    message: lines[0] || "npm install failed",
    rawLines: tailLines(lines),
    at: Date.now(),
  };
}

/** Convenience for the EADDRINUSE branch that's detected pre-pattern. */
export function makePortConflictError(port: number, lines: string[]): BundleBuildError {
  return {
    kind: "port_conflict",
    message: `port ${port} is already in use`,
    rawLines: tailLines(lines),
    at: Date.now(),
  };
}

/** Exposed for tests to assert behaviour without going through the full runner. */
export const KOTA0_BUILD_ERROR_KIND_VALUES: BundleBuildErrorKind[] = [
  "missing_import",
  "vite_build_error",
  "npm_install_error",
  "port_conflict",
];
