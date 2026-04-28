/**
 * Short non-authoritative digest of an App.vue SFC for Gemini system context.
 */
import { parse as parseSfc } from "@vue/compiler-sfc";

const MAX_IMPORT_LINES = 24;
const MAX_FIRST_LINE_CHARS = 160;

function topLevelImports(scriptSource: string): string[] {
  const out: string[] = [];
  const re = /^\s*import\s+[\s\S]*?;\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scriptSource)) !== null) {
    const line = m[0].trim().replace(/\s+/g, " ");
    if (line.length > 0) out.push(line);
    if (out.length >= MAX_IMPORT_LINES) break;
  }
  return out;
}

/** Compact outline; returns null if parse fails. */
export function buildNvibeSfcHeadOutline(source: string): string | null {
  const { descriptor, errors } = parseSfc(source, { filename: "App.vue" });
  if (errors.length > 0) return null;

  const lines: string[] = [];

  if (descriptor.template) {
    const content = descriptor.template.content.trim();
    const lc = content.split(/\r?\n/).length;
    const first = content.split(/\r?\n/)[0]?.trim().slice(0, MAX_FIRST_LINE_CHARS) ?? "";
    lines.push(`template: ~${lc} line(s); first line: ${first || "(empty)"}`);
  } else {
    lines.push("template: (none)");
  }

  const script = descriptor.scriptSetup ?? descriptor.script;
  if (script) {
    const setup = descriptor.scriptSetup !== undefined;
    const lang = script.lang || "js";
    lines.push(`script: ${setup ? "script setup" : "script"} lang=${lang}`);
    const imports = topLevelImports(script.content);
    if (imports.length > 0) {
      lines.push("imports:");
      for (const im of imports) lines.push(`  ${im}`);
    } else {
      lines.push("imports: (none detected)");
    }
  } else {
    lines.push("script: (none)");
  }

  const styles = descriptor.styles ?? [];
  if (styles.length === 0) {
    lines.push("style blocks: 0");
  } else {
    const bits = styles.map((s, i) => {
      const scoped = s.scoped ? "scoped" : "global";
      const lang = s.lang || "css";
      return `#${i + 1} ${lang} ${scoped}`;
    });
    lines.push(`style blocks: ${bits.join("; ")}`);
  }

  return lines.join("\n");
}
