/**
 * artistUtils.ts
 * Shared utilities for artist name normalization and grouping.
 */

/**
 * Normalizes an artist name for deduplication purposes.
 * Lowercases, removes leading/trailing whitespace, collapses internal spaces.
 * Preserves the original string for display — only use the normalized form as a key.
 *
 * Examples:
 *   "Bad Bunny " → "bad bunny"
 *   "BAD BUNNY"  → "bad bunny"
 *   "bad  bunny" → "bad bunny"
 */
export function normalizeArtist(name: string): string {
  if (!name) return 'unknown';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Groups an array of items by their normalized artist name.
 * Returns a Map: normalizedKey → { displayName, items[] }
 */
export function groupByArtist<T extends { artist: string }>(
  items: T[]
): Map<string, { displayName: string; items: T[] }> {
  const map = new Map<string, { displayName: string; items: T[] }>();

  for (const item of items) {
    const key = normalizeArtist(item.artist);
    if (!map.has(key)) {
      map.set(key, { displayName: item.artist || 'Unknown Artist', items: [] });
    }
    map.get(key)!.items.push(item);
  }

  return map;
}

/**
 * Returns a sorted artist summary array from a grouped map.
 * Sorted by count descending.
 */
export function getArtistSummary<T extends { artist: string; duration: number }>(
  items: T[]
): Array<{ key: string; displayName: string; count: number; totalDuration: number }> {
  const grouped = groupByArtist(items);
  const result: Array<{ key: string; displayName: string; count: number; totalDuration: number }> = [];

  for (const [key, { displayName, items: groupItems }] of grouped.entries()) {
    result.push({
      key,
      displayName,
      count: groupItems.length,
      totalDuration: groupItems.reduce((acc, i) => acc + (i.duration || 0), 0),
    });
  }

  // Sort by count descending
  return result.sort((a, b) => b.count - a.count);
}

/**
 * Formats seconds into "Xh Ym" or "Ym" string.
 */
export function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${totalMinutes}m`;
}

/**
 * Generates initials avatar text from an artist name.
 * E.g. "Bad Bunny" → "BB", "Feid" → "FE"
 */
export function getArtistInitials(name: string): string {
  if (!name) return '??';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Returns a deterministic HSL hue from an artist name string.
 * Used to give each artist a unique avatar color.
 */
export function getArtistHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}
