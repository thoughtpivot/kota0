/**
 * Strip legacy structured sections from persisted nVibe chat markdown (display-only).
 * Older rows included **Next steps** / **Questions** after the natural reply.
 */
export function stripLegacyNvibeChatSections(markdown: string): string {
  const lower = markdown.toLowerCase();
  const candidates = [
    lower.indexOf("**next steps**"),
    lower.indexOf("**questions**"),
    lower.indexOf("**open questions**"),
    lower.indexOf("**plan**"),
  ].filter((i) => i >= 0);
  if (candidates.length === 0) return markdown;

  const idxFirst = Math.min(...candidates);
  const applyIdx = markdown.indexOf("\n\n_When this looks right");
  const head = markdown.slice(0, idxFirst).trimEnd();
  const tail = applyIdx > idxFirst ? markdown.slice(applyIdx) : "";
  return tail ? `${head}${tail}` : head;
}
