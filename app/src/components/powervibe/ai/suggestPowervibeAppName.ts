import "@/lib/env";
import { GoogleGenAI } from "@google/genai";
import { DEFAULT_GEMINI_MODEL } from "@/lib/geminiModel";

/** Curated pool when Gemini is unavailable or returns junk. */
const FALLBACK_POWERVIBE_APP_NAMES = [
  "Northwind Ledger",
  "Signal Garden",
  "Parcel Atlas",
  "Velvet Compass",
  "Paper Lantern",
  "Quiet Harbor",
  "Silver Orchard",
  "Neon Fieldnotes",
  "Wavelength Studio",
  "Draftsmith",
  "Morning Ritual",
  "Blueprint Alley",
  "Driftwood Journal",
  "Copper Thread",
  "Glass Finch",
  "Summit Scratchpad",
  "Fogline Dispatch",
  "Marble Agenda",
  "Basement Telescope",
  "Riverband CRM",
  "Patchwork Radar",
  "Halfmoon Digest",
  "Brass Tactics",
  "Velvet Ledger",
  "Archive Aurora",
  "Signal Bloom",
  "Folded Atlas",
  "Minute Maker",
  "Cloud Harbor",
  "Pixel Orchard",
  "Northstar Memo",
  "Wildtype Studio",
  "Soft Ledger",
  "Granite Flow",
  "Paper Pilot",
  "Echo Chamber Lite",
  "Drift Compass",
  "Lantern Lane",
  "Bracket & Beam",
  "Studio Bramble",
] as const;

export function pickFallbackPowervibeAppName(): string {
  const i = Math.floor(Math.random() * FALLBACK_POWERVIBE_APP_NAMES.length);
  return FALLBACK_POWERVIBE_APP_NAMES[i]!;
}

function normalizeSuggestedName(raw: string | undefined): string | null {
  if (!raw) return null;
  let t = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  const line = t.split(/\r?\n/).find((s) => s.trim().length > 0);
  if (!line) return null;
  t = line.trim();
  if (t.length < 2 || t.length > 80) return null;
  return t;
}

/**
 * One creative product-style PowerVibe app name via Gemini when `GEMINI_API_KEY` is set; otherwise a random fallback label.
 */
export async function suggestPowervibeAppName(): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return pickFallbackPowervibeAppName();

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Reply with exactly one short, catchy name for a personal web app (startup / editorial vibe). " +
                "Rules: 2–5 words, Title Case, no surrounding quotes, no trailing punctuation, no emoji. " +
                "Do not include explanations — output only the name.",
            },
          ],
        },
      ],
      config: {
        temperature: 1.05,
        maxOutputTokens: 40,
      },
    });
    const cleaned = normalizeSuggestedName(response.text);
    return cleaned ?? pickFallbackPowervibeAppName();
  } catch {
    return pickFallbackPowervibeAppName();
  }
}
