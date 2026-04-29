/** Parse `KEY=value` assignment line; returns key or null for comments / blanks / invalid keys. */
function parseKeyFromAssignmentLine(line: string): string | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const eq = t.indexOf("=");
  if (eq <= 0) return null;
  const k = t.slice(0, eq).trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : null;
}

/**
 * Merge `patchText` assignments into `baseText`: patch keys replace the first matching line in base;
 * duplicate KEY lines in base are dropped after replacement; keys only in patch are appended.
 */
export function mergeDotEnvPatch(baseText: string, patchText: string): string {
  const patchByKey = new Map<string, string>();
  for (const raw of patchText.split(/\r?\n/)) {
    const k = parseKeyFromAssignmentLine(raw);
    if (k) patchByKey.set(k, raw.trimEnd());
  }
  if (patchByKey.size === 0) return baseText;

  const out: string[] = [];
  const appliedPatchKeys = new Set<string>();

  for (const raw of baseText.split(/\r?\n/)) {
    const k = parseKeyFromAssignmentLine(raw);
    if (k && patchByKey.has(k)) {
      if (!appliedPatchKeys.has(k)) {
        out.push(patchByKey.get(k)!);
        appliedPatchKeys.add(k);
      }
      continue;
    }
    out.push(raw);
  }
  for (const [k, line] of patchByKey) {
    if (!appliedPatchKeys.has(k)) out.push(line);
  }
  if (out.length === 0) return "";
  return `${out.join("\n")}\n`;
}
