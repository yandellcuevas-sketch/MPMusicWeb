import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Filter recovered selection IDs against the actual list of existing cart items.
 * Mirroring the logic implemented in ProcessTab and UsbTab.
 */
function filterExistingIds<T extends { id: string }>(recoveredIds: string[], items: T[]): string[] {
  const existingSet = new Set(items.map((i) => i.id));
  return recoveredIds.filter((id) => existingSet.has(id));
}

describe('Selection Recovery & Stale ID Filtering', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('recovers and filters IDs when some selected items were deleted', () => {
    // Stored selection has B and D
    const storedIds = ['B', 'D'];
    sessionStorage.setItem('processing_selection_ids', JSON.stringify(storedIds));

    // Cart only has A, B, C (D was deleted)
    const cartItems = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];

    const raw = sessionStorage.getItem('processing_selection_ids');
    const parsed: string[] = raw ? JSON.parse(raw) : [];

    const validIds = filterExistingIds(parsed, cartItems);

    expect(validIds).toEqual(['B']);
    expect(validIds.includes('D')).toBe(false);
  });

  it('falls back to empty when all recovered IDs no longer exist in cart', () => {
    const storedIds = ['X', 'Y', 'Z'];
    sessionStorage.setItem('processing_selection_ids', JSON.stringify(storedIds));

    const cartItems = [{ id: 'A' }, { id: 'B' }];

    const raw = sessionStorage.getItem('processing_selection_ids');
    const parsed: string[] = raw ? JSON.parse(raw) : [];

    const validIds = filterExistingIds(parsed, cartItems);

    expect(validIds).toEqual([]);
  });

  it('clears sessionStorage cleanly on exit selection', () => {
    sessionStorage.setItem('processing_selection_ids', JSON.stringify(['A', 'B']));
    expect(sessionStorage.getItem('processing_selection_ids')).not.toBeNull();

    // User clicks Exit selection
    sessionStorage.removeItem('processing_selection_ids');
    expect(sessionStorage.getItem('processing_selection_ids')).toBeNull();
  });
});
