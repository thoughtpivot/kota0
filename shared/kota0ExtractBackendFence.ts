/**
 * Recover `App.backend.ts` (TypeScript) when the model used ```ts … ``` in markdown
 * instead of a structured `proposedAppBackend` field.
 * Returns the last non-empty ```ts/```typescript fenced block.
 */
export function extractTsFenceFromMarkdown(text: string): string | null {
  if (!text.trim()) return null;
  const re = /```(?:ts|typescript)\s*\r?\n([\s\S]*?)```/gi;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const body = m[1]?.trim();
    if (body) last = body;
  }
  return last;
}
