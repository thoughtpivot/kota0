import "@/lib/env";
import { kota0AiGenerate } from "@/components/kota0/ai/kota0AiProvider";

/** Curated pool when Gemini is unavailable or returns junk — short, whimsical, not corporate. */
const FALLBACK_K0_APP_NAMES = [
  "Lemon Giraffe",
  "Sock Meteor",
  "Quiet Waffle",
  "Turbo Snail",
  "Misty Pickle",
  "Jelly Moonbeam",
  "Fuzzy Luggage",
  "Purple Otter",
  "Crispy Cloud",
  "Sleepy Rocket",
  "Tiny Thunder",
  "Wobbly Telescope",
  "Brave Pancake",
  "Sneaky Marigold",
  "Cosmic Marshmallow",
  "Grumpy Lantern",
  "Happy Tumbleweed",
  "Silver Spoonbill",
  "Dancing Tadpole",
  "Gentle Boomerang",
  "Lucky Hedgehog",
  "Curious Kite",
  "Bouncy Cobblestone",
  "Rusty Sunshine",
  "Velvet Snowball",
  "Paper Moonwalk",
  "Orange Polka",
  "Blueberry Compass",
  "Whisper Gizmo",
  "Doodle Badger",
  "Noodle Aurora",
  "Pocket Zeppelin",
  "Mellow Badminton",
  "Zippy Marmalade",
  "Fluffy Voltage",
  "Soggy Firefly",
  "Captain Crumpet",
  "Nimbus Sandwich",
  "Twinkle Hedge",
  "Riddle Badger",
  "Puddle Orchestra",
  "Snug Walrus",
  "Bonkers Biscuit",
  "Tiptoe Volcano",
  "Giggly Glacier",
  "Mango Moonboot",
] as const;

export function pickFallbackKota0AppName(): string {
  const i = Math.floor(Math.random() * FALLBACK_K0_APP_NAMES.length);
  return FALLBACK_K0_APP_NAMES[i]!;
}

/** Reject names that lean on the same tired token the model often overuses. */
function isBannedAppNameToken(t: string): boolean {
  return /\bdaily\b/i.test(t);
}

function clampToAtMostThreeWords(t: string): string {
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.slice(0, 3).join(" ");
}

function toTitleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function normalizeSuggestedName(raw: string | undefined): string | null {
  if (!raw) return null;
  let t = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  const line = t.split(/\r?\n/).find((s) => s.trim().length > 0);
  if (!line) return null;
  t = toTitleCaseWords(clampToAtMostThreeWords(line.trim()));
  if (t.length < 2 || t.length > 48) return null;
  if (isBannedAppNameToken(t)) return null;
  return t;
}

/**
 * One creative product-style Kota0 app name via Gemini when `GEMINI_API_KEY` is set; otherwise a random fallback label.
 */
export async function suggestKota0AppName(): Promise<string> {
  if (!process.env.GEMINI_API_KEY?.trim()) return pickFallbackKota0AppName();
  try {
    const result = await kota0AiGenerate({
      temperature: 1.05,
      maxOutputTokens: 40,
      prompt:
        "Reply with exactly one playful, whimsical name for a tiny personal web app. " +
        "Rules: at most THREE simple words (one to three words only), Title Case, no surrounding quotes, " +
        "no trailing punctuation, no emoji, no colons or slashes. " +
        "Make it feel random and lightly silly — like a snack, animal, weather, toy, or gentle nonsense — not corporate, not a slogan. " +
        "Do NOT use the word \"Daily\" (or \"daily\") anywhere. Avoid overused product words like Hub, Suite, Nexus, Pulse, Flow, or CRM unless clearly absurd and funny. " +
        "Do not include explanations — output only the name.",
    });
    const cleaned = normalizeSuggestedName(result.text);
    return cleaned ?? pickFallbackKota0AppName();
  } catch {
    return pickFallbackKota0AppName();
  }
}
