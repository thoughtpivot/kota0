/**
 * Unified-diff-style patches for the active app's `App.vue` / `App.backend.ts` /
 * `.env`. Line numbers in real unified diffs are unstable across turns and LLMs
 * tend to miscount, so we IGNORE the `@@ … @@` hunk header content and rely on
 * the hunk body itself to locate the change.
 *
 * Wire format (lenient — accepts both standard unified-diff and our older
 * "anchor + space" variant):
 *   === PATCH App.vue ===
 *   @@ ... @@                  (header content ignored; just a hunk separator)
 *    context line              (leading single space — used to locate)
 *   -removed line              (with or without space after `-`)
 *   +added line                (with or without space after `+`)
 *
 * Multiple hunks per file are allowed (one `@@ … @@` per hunk).
 * Multiple files are allowed (one `=== PATCH <file> ===` per file).
 *
 * Apply rules:
 *  - For each hunk, the **search block** is the in-order concatenation of context
 *    (` `) and removed (`-`) lines. We find that block as a contiguous run in the
 *    current file content. It MUST appear exactly once; 0 or >1 matches → fall
 *    back to a full-file rewrite for that file.
 *  - The **replacement** is the in-order concatenation of context (` `) and added
 *    (`+`) lines.
 *  - If a hunk contains only `+` lines (pure insertion), we require at least one
 *    leading context line (or one removed line) — otherwise we can't locate it.
 */

export type Kota0PatchFile = "App.vue" | "App.backend.ts" | ".env";

export type Kota0HunkLineKind = "context" | "removed" | "added";

export type Kota0HunkLine = {
  kind: Kota0HunkLineKind;
  text: string;
};

export type Kota0PatchHunk = {
  lines: Kota0HunkLine[];
};

export type Kota0FilePatch = {
  file: Kota0PatchFile;
  hunks: Kota0PatchHunk[];
};

export type Kota0PatchParseResult =
  | { ok: true; patches: Kota0FilePatch[] }
  | { ok: false; reason: string };

export type Kota0PatchApplyFailureReason =
  | "anchor_not_found"
  | "anchor_not_unique"
  | "no_locator"
  | "empty_hunk";

export type Kota0PatchApplyResult =
  | { ok: true; content: string }
  | { ok: false; reason: Kota0PatchApplyFailureReason; detail: string };

const FILE_HEADER_RE = /^===\s*PATCH\s+(App\.vue|App\.backend\.ts|\.env)\s*===\s*$/;
/** Header content (line ranges, function name, etc.) is intentionally discarded — body locates the hunk. */
const HUNK_HEADER_RE = /^@@.*@@\s*$/;

/**
 * Strip the leading diff marker and return the hunk line text. All line kinds use
 * the same rule (`line.slice(1)`) so context anchors match inserted `+` lines on
 * subsequent turns — extra stripping on `+`/`-` only caused anchor_not_found drift.
 */
function classifyLine(line: string): Kota0HunkLine | null {
  if (line.length === 0) {
    return { kind: "context", text: "" };
  }
  const c = line[0];
  if (c === "-") return { kind: "removed", text: line.slice(1) };
  if (c === "+") return { kind: "added", text: line.slice(1) };
  if (c === " ") return { kind: "context", text: line.slice(1) };
  return null;
}

export function parseKota0Patch(text: string): Kota0PatchParseResult {
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, reason: "empty_patch" };
  }
  const lines = text.split(/\r?\n/);
  const patches: Kota0FilePatch[] = [];
  let current: Kota0FilePatch | null = null;
  let hunk: Kota0PatchHunk | null = null;

  const closeHunk = (): void => {
    if (hunk && current && hunk.lines.length > 0) {
      current.hunks.push(hunk);
    }
    hunk = null;
  };
  const closeFile = (): void => {
    closeHunk();
    if (current && current.hunks.length > 0) {
      patches.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    const fileMatch = FILE_HEADER_RE.exec(line);
    if (fileMatch) {
      closeFile();
      current = { file: fileMatch[1] as Kota0PatchFile, hunks: [] };
      hunk = null;
      continue;
    }
    if (!current) continue;
    if (HUNK_HEADER_RE.test(line)) {
      closeHunk();
      hunk = { lines: [] };
      continue;
    }
    if (!hunk) {
      // Some emitters omit the `@@ … @@` header entirely. If we see a hunk-like
      // line right after the file header, open an implicit hunk for it.
      const cls = classifyLine(line);
      if (cls && (cls.kind === "removed" || cls.kind === "added" || cls.kind === "context")) {
        hunk = { lines: [cls] };
      }
      continue;
    }
    const cls = classifyLine(line);
    if (cls) {
      hunk.lines.push(cls);
    }
    // Non-hunk lines inside an open hunk are ignored (lets the model add a `# comment`).
  }
  closeFile();

  if (patches.length === 0) {
    return { ok: false, reason: "no_patch_blocks_found" };
  }
  return { ok: true, patches };
}

function findUniqueBlockIndex(sourceLines: string[], searchBlock: string[]): { index: number; count: number } {
  if (searchBlock.length === 0) return { index: -1, count: 0 };
  let index = -1;
  let count = 0;
  outer: for (let i = 0; i + searchBlock.length <= sourceLines.length; i++) {
    for (let j = 0; j < searchBlock.length; j++) {
      if (sourceLines[i + j] !== searchBlock[j]) continue outer;
    }
    if (index < 0) index = i;
    count += 1;
  }
  return { index, count };
}

export function applyKota0FilePatch(content: string, patch: Kota0FilePatch): Kota0PatchApplyResult {
  let lines = content.split(/\r?\n/);
  for (const hunk of patch.hunks) {
    if (hunk.lines.length === 0) {
      return { ok: false, reason: "empty_hunk", detail: `Empty hunk in ${patch.file}` };
    }
    // search = context + removed (in order); replacement = context + added.
    const search: string[] = [];
    const replacement: string[] = [];
    for (const ln of hunk.lines) {
      if (ln.kind === "context") {
        search.push(ln.text);
        replacement.push(ln.text);
      } else if (ln.kind === "removed") {
        search.push(ln.text);
      } else {
        replacement.push(ln.text);
      }
    }
    if (search.length === 0) {
      return {
        ok: false,
        reason: "no_locator",
        detail: `Hunk in ${patch.file} has no context or removed lines — cannot locate a pure-insert without an anchor`,
      };
    }
    const { index, count } = findUniqueBlockIndex(lines, search);
    if (count === 0) {
      return {
        ok: false,
        reason: "anchor_not_found",
        detail: `Could not locate hunk in ${patch.file}. Search block (first line): ${truncate(search[0] ?? "", 100)}`,
      };
    }
    if (count > 1) {
      return {
        ok: false,
        reason: "anchor_not_unique",
        detail: `Hunk in ${patch.file} matches ${count} places; add more context lines: ${truncate(search[0] ?? "", 100)}`,
      };
    }
    lines = [...lines.slice(0, index), ...replacement, ...lines.slice(index + search.length)];
  }
  return { ok: true, content: lines.join("\n") };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export type Kota0PatchApplySummary = {
  applied: { file: Kota0PatchFile; nextContent: string }[];
  fallbacks: { file: Kota0PatchFile; reason: Kota0PatchApplyFailureReason; detail: string }[];
};

export function applyKota0Patches(
  patches: Kota0FilePatch[],
  current: { appVue: string; appBackend: string; bundleEnv: string },
): Kota0PatchApplySummary {
  const applied: { file: Kota0PatchFile; nextContent: string }[] = [];
  const fallbacks: Kota0PatchApplySummary["fallbacks"] = [];
  for (const patch of patches) {
    const base =
      patch.file === "App.vue" ? current.appVue
      : patch.file === "App.backend.ts" ? current.appBackend
      : current.bundleEnv;
    const result = applyKota0FilePatch(base, patch);
    if (result.ok) {
      applied.push({ file: patch.file, nextContent: result.content });
    } else {
      fallbacks.push({ file: patch.file, reason: result.reason, detail: result.detail });
    }
  }
  return { applied, fallbacks };
}
