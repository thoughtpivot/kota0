/**
 * Detects historic seeded Kota0 assistant intros (no longer added for new threads).
 * Heuristics work in the browser; exact SHA-256 of normalized bodies is checked on the server only.
 */

export type LegacyWelcomeChatRole = "user" | "assistant" | "system";

/** Lowercase, NFKC, collapse whitespace, normalize dash and apostrophe variants. */
export function normalizeForKota0LegacyMatch(input: string): string {
  let t = input.normalize("NFKC");
  t = t.replaceAll("\u2019", "'").replaceAll("\u2018", "'").replaceAll("\u2014", "-").replaceAll("\u2013", "-");
  t = t.replace(/\s+/gu, " ").trim().toLowerCase();
  return t;
}

function endsWithLegacyClosePhrase(normalized: string): boolean {
  const p = "what would you like to build or change first?";
  const pfw = "what would you like to build or change first？"; // U+FF1F fullwidth
  if (normalized.endsWith(p) || normalized.endsWith(pfw)) return true;
  const strip = normalized.replace(/[.!?？…\s]+$/u, "");
  return strip.endsWith("what would you like to build or change first");
}

/**
 * True if this row is a known long seeded welcome (Unicode-tolerant).
 * Assistant and system roles only. For extra matches, use server-side hash check.
 */
export function isLegacySeededWelcomeMessage(role: LegacyWelcomeChatRole, content: string): boolean {
  if (role !== "assistant" && role !== "system") return false;
  const t = content.trim();
  if (t.length < 100) return false;
  const n = normalizeForKota0LegacyMatch(t);
  if (!endsWithLegacyClosePhrase(n)) return false;

  if (n.includes("here to help you shape app.vue")) return true;
  if (n.includes("i can help you shape **app.vue**")) return true;
  if (n.includes("daisyui component classes (e.g.")) return true;
  if (n.includes("plain questions get direct answers; when you want the app changed")) return true;
  if (n.includes("one vue file: template, script, styles")) return true;
  if (n.includes("shadcn-vue-style building blocks from @/components/ui/")) return true;
  if (n.includes("click apply to save it to scribe and refresh the preview")) return true;
  return false;
}

export function filterLegacyWelcomeFromChatMessages<T extends { role: string; content: string }>(messages: T[]): T[] {
  return messages.filter(
    (m) =>
      !isLegacySeededWelcomeMessage(
        m.role as LegacyWelcomeChatRole,
        m.content,
      ),
  );
}
