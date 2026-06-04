/**
 * Most recently modified first (`updatedAt` ISO descending). Mutates `items` in place.
 */
export function sortAppsByUpdatedAtDesc<T extends { updatedAt: string | null }>(items: T[]): void {
  items.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}
