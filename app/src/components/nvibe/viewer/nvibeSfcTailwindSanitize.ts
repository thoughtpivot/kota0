/**
 * Tailwind v4 + @tailwindcss/vite: `selection:*` inside `@apply` in Vue SFC `<style>` fails at build time.
 * Strip those tokens from style blocks and optionally append plain `::selection` rules so highlight styling remains.
 */
import { parse as parseSfc } from "@vue/compiler-sfc";

const FALLBACK_SELECTION_CSS =
  "\n\n::selection {\n  background-color: #a7f3d0;\n  color: #064e3b;\n}\n\n.dark ::selection {\n  background-color: #065f46;\n  color: #d1fae5;\n}\n";

function styleBlockHadTailwindSelectionUtility(css: string): boolean {
  return /(?:^|\s)(?:dark:)?selection:[^\s;{}]+/.test(css);
}

function stripSelectionUtilitiesFromStyleInner(css: string): string {
  const strip = (s: string) =>
    s.replace(/\s+dark:selection:[^\s;{}]+/gi, " ").replace(/\s+selection:[^\s;{}]+/gi, " ");
  // Pass 1: each `@apply … ;` block (incl. multiline utilities) so `selection:` on its own line is caught.
  let next = css.replace(/@apply[\s\S]*?;/g, (block) => strip(block));
  // Pass 2: anything left outside a single-line @apply (e.g. minified on one line).
  next = strip(next);
  next = next.replace(/[ \t]{2,}/g, " ");
  next = next.replace(/@apply\s*;\s*/g, "").replace(/@apply\s*\n\s*;/g, "");
  return next;
}

/** Tailwind v4 in Vue SFC `<style>`: `@apply` needs the app CSS entry via `@reference`. */
function ensureTailwindReferenceForApply(css: string): string {
  if (!/@apply\b/.test(css)) return css;
  if (/@reference\s+/.test(css)) return css;
  return `@reference "../../style.css";\n\n${css.trimStart()}`;
}

/** Mutates only `<style>` inner content; leaves `<template>` `class="selection:…"` unchanged. */
export function sanitizeNvibeAppSfcForTailwindVite(source: string): string {
  const { descriptor, errors } = parseSfc(source, { filename: "App.vue" });
  if (errors.length > 0 || descriptor.styles.length === 0) return source;

  const blocks = [...descriptor.styles].sort((a, b) => a.loc.start.offset - b.loc.start.offset);
  let out = source;
  let delta = 0;
  for (const block of blocks) {
    const start = block.loc.start.offset + delta;
    const end = block.loc.end.offset + delta;
    const had = styleBlockHadTailwindSelectionUtility(block.content);
    let inner = stripSelectionUtilitiesFromStyleInner(block.content);
    if (had && !/\b::selection\s*\{/.test(inner)) {
      inner = inner.trimEnd() + FALLBACK_SELECTION_CSS;
    }
    inner = ensureTailwindReferenceForApply(inner);
    if (inner === block.content) continue;
    const oldLen = end - start;
    out = out.slice(0, start) + inner + out.slice(end);
    delta += inner.length - oldLen;
  }
  return out;
}
