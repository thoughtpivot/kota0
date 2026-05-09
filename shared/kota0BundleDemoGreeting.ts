/**
 * Kota0 default bundle: one-line multilingual “greeting, smart name” for demo UI.
 * Uses workspace platform AI from bundle Flight; falls back when env or model is unavailable.
 */
import { kota0PlatformAiCompleteText } from "@shared/kota0PlatformAi.ts";

const FALLBACK_GREETINGS = [
  "Hola",
  "Bonjour",
  "Ciao",
  "Hallo",
  "Hej",
  "Olá",
  "Salut",
  "Konnichiwa",
  "Namaste",
  "Guten Tag",
  "Szia",
  "Shalom",
] as const;

const FALLBACK_NAMES = [
  "Meridian Atlas",
  "Velvet Compass",
  "Signal Garden",
  "Northwind Ledger",
  "Parcel Atlas",
  "Quiet Harbor",
  "Silver Orchard",
  "Neon Fieldnotes",
  "Wavelength Studio",
  "Blueprint Alley",
  "Copper Thread",
  "Glass Finch",
  "Archive Aurora",
  "Studio Bramble",
  "Drift Compass",
  "Lantern Lane",
  "Soft Ledger",
  "Paper Pilot",
  "Summit Scratchpad",
  "Riverband CRM",
] as const;

export function normalizeDemoGreetingPhrase(raw: string): string {
  let t = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  const line = t.split(/\r?\n/).find((s) => s.trim().length > 0);
  if (!line) return "";
  t = line.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (t.length > 160) t = t.slice(0, 157) + "…";
  return t;
}

function pickFallbackPhrase(): string {
  const g = FALLBACK_GREETINGS[Math.floor(Math.random() * FALLBACK_GREETINGS.length)]!;
  const n = FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)]!;
  return `${g}, ${n}`;
}

/**
 * Returns a single display line (non-English greeting + comma + invented name when AI works).
 */
export async function generateKota0DemoGreetingPhrase(): Promise<{ phrase: string; source: "ai" | "fallback" }> {
  try {
    const text = await kota0PlatformAiCompleteText({
      prompt:
        "Pick any natural language except English. Output exactly one line: the common single-word or two-word greeting " +
        "for 'Hello' in that language, then a comma and a space, then a plausible invented product or research name " +
        "(two to four words, Title Case). No quotes, no labels, no explanation — only that one line. " +
        "Example shape: Bonjour, Meridian Atlas",
      maxOutputTokens: 96,
    });
    const phrase = normalizeDemoGreetingPhrase(text);
    if (phrase.length >= 8) {
      return { phrase, source: "ai" };
    }
  } catch {
    /* use fallback */
  }
  return { phrase: pickFallbackPhrase(), source: "fallback" };
}
