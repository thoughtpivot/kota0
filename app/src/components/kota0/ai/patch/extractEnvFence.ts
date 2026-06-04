/**
 * Recover bundle `.env`-style text when the model used ```env … ``` (or ```dotenv … ```)
 * in markdown — same pattern as ```vue / ```ts for AI **Apply**.
 */
export function extractEnvFenceFromMarkdown(text: string): string | null {
  if (!text.trim()) return null;
  const re = /```(?:env|dotenv)\s*\r?\n([\s\S]*?)```/gi;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const body = m[1]?.trim();
    if (body) last = body;
  }
  return last;
}
