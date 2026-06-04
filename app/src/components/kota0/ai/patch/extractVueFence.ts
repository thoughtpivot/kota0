/**
 * Recover SFC text when the model put ```vue ... ``` in markdown instead of `proposedAppVue`.
 * Returns the last fenced block that looks like a Vue SFC (contains `<template>`).
 */
export function extractVueFenceFromMarkdown(text: string): string | null {
  if (!text.trim()) return null;
  const re = /```(?:vue)\s*\r?\n([\s\S]*?)```/gi;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const body = m[1]?.trim();
    if (body && /<template[\s>]/i.test(body)) last = body;
  }
  return last;
}
