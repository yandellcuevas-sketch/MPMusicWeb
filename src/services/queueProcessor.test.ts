import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueProcessor, canProcessItem } from './queueProcessor';
import { db } from '../db/database';
import { mediaRegistry } from './mediaAssetRegistry';
import { mediaProcessor } from './wasmMediaProcessor';
import type { CartItem } from '../db/database';

let mockCartItems: CartItem[] = [];

vi.mock('../db/database', () => {
  const mockCartTable = {
    update: vi.fn(async (id: string, updates: Partial<CartItem>) => {
      const item = mockCartItems.find((i) => i.id === id);
      if (item) {
        Object.assign(item, updates);
      }
    }),
    sortBy: vi.fn(async () => mockCartItems),
    toArray: vi.fn(async () => mockCartItems),
    where: vi.fn(() => ({
      anyOf: vi.fn((...statuses: string[]) => ({
        sortBy: vi.fn(async () =>
          mockCartItems.filter((i) => statuses.flat().includes(i.status))
        ),
      })),
    })),
  };
  const mockHistoryTable = {
    put: vi.fn(async () => {}),
  };
  const mockSettingsTable = {
    get: vi.fn(async () => ({ concurrencyLimit: 2 })),
  };
  return {
    db: {
      cart: mockCartTable,
      history: mockHistoryTable,
      settings: mockSettingsTable,
      transaction: vi.fn((_mode, _tables, cb) => cb()),
    },
  };
});

vi.mock('./wasmMediaProcessor', () => {
  return {
    mediaProcessor: {
      initialize: vi.fn(() => Promise.resolve()),
      convert: vi.fn(() => Promise.resolve(new Blob(['test'], { type: 'audio/mpeg' }))),
      cancel: vi.fn(() => Promise.resolve()),
    },
  };
});

vi.mock('./metadataService', () => {
  return {
    writeMetadata: vi.fn((_id, blob, _item) => Promise.resolve(blob)),
  };
});

function createMockItem(
  id: string,
  status: CartItem['status'] = 'pending',
  source: CartItem['source'] = 'local',
  allowProcessing = true
): CartItem {
  return {
    id,
    source,
    title: `Title ${id}`,
    artist: `Artist ${id}`,
    artistNormalized: `artist ${id}`,
    duration: 180,
    outputFormat: 'mp3',
    quality: '320',
    status,
    allowProcessing,
    addedAt: Date.now(),
  };
}

describe('QueueProcessor', () => {
  let processor: QueueProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    mediaRegistry.clear();
    mockCartItems = [];
    processor = new QueueProcessor();
  });

  describe('canProcessItem validation', () => {
    it('returns false for items with status source_required', () => {
      const item = createMockItem('sr_1', 'source_required');
      expect(canProcessItem(item)).toBe(false);
      expect(processor.canProcess(item)).toBe(false);
    });

    it('returns false for YouTube items without local file attachment', () => {
      const item = createMockItem('yt_1', 'source_required', 'youtube', false);
      expect(canProcessItem(item)).toBe(false);
    });

    it('returns true for local items when binary exists in mediaRegistry', () => {
      const item = createMockItem('loc_1', 'pending', 'local', true);
      mediaRegistry.registerLocalFile('loc_1', new File(['audio'], 'loc.mp3'));
      expect(canProcessItem(item)).toBe(true);
    });

    it('returns true for direct items with a sourceUrl', () => {
      const item = createMockItem('dir_1', 'pending', 'direct', true);
      item.sourceUrl = 'https://example.com/audio.mp3';
      expect(canProcessItem(item)).toBe(true);
    });
  });

  it('runs transcode when file is local and available', async () => {
    const item = createMockItem('item_1', 'pending');
    mockCartItems = [item];

    const file = new File(['audio'], 'bohemian.mp3');
    mediaRegistry.registerLocalFile('item_1', file);

    await processor.processItem(item);

    expect(db.cart.update).toHaveBeenCalledWith('item_1', { status: 'processing', progress: 0 });
    expect(mediaProcessor.convert).toHaveBeenCalledWith(file, 'mp3', '320', expect.any(Function), 'item_1');
    expect(db.cart.update).toHaveBeenCalledWith('item_1', { status: 'ready', progress: 100 });
    expect(db.history.put).toHaveBeenCalled();
  });

  it('skips preview-only items and does not fail them when processNext runs', async () => {
    const ytItem = createMockItem('yt_preview', 'source_required', 'youtube', false);
    const localItem = createMockItem('local_ready', 'pending', 'local', true);

    mockCartItems = [ytItem, localItem];
    mediaRegistry.registerLocalFile('local_ready', new File(['audio'], 'local.mp3'));

    await processor.startProcessing();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // localItem must be processed
    expect(localItem.status).toBe('ready');
    // ytItem must remain in source_required status (not failed!)
    expect(ytItem.status).toBe('source_required');
  });

  describe('Scoped Processing Lifecycle & Scope Isolation', () => {
    it('processes ONLY selected items (B, D) and leaves others (A, C, E) untouched', async () => {
      const itemA = createMockItem('A', 'pending');
      const itemB = createMockItem('B', 'pending');
      const itemC = createMockItem('C', 'pending');
      const itemD = createMockItem('D', 'pending');
      const itemE = createMockItem('E', 'pending');

      mockCartItems = [itemA, itemB, itemC, itemD, itemE];

      for (const id of ['A', 'B', 'C', 'D', 'E']) {
        mediaRegistry.registerLocalFile(id, new File(['audio'], `${id}.mp3`));
      }

      await processor.startProcessing(['B', 'D']);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(itemB.status).toBe('ready');
      expect(itemD.status).toBe('ready');

      expect(itemA.status).toBe('pending');
      expect(itemC.status).toBe('pending');
      expect(itemE.status).toBe('pending');
    });

    it('cleans activeScopeIds upon completion and allows a subsequent global run to process A, C, E', async () => {
      const itemA = createMockItem('A', 'pending');
      const itemB = createMockItem('B', 'pending');
      const itemC = createMockItem('C', 'pending');
      const itemD = createMockItem('D', 'pending');
      const itemE = createMockItem('E', 'pending');

      mockCartItems = [itemA, itemB, itemC, itemD, itemE];

      for (const id of ['A', 'B', 'C', 'D', 'E']) {
        mediaRegistry.registerLocalFile(id, new File(['audio'], `${id}.mp3`));
      }

      // First run: scoped to B and D
      await processor.startProcessing(['B', 'D']);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(itemB.status).toBe('ready');
      expect(itemD.status).toBe('ready');
      expect(processor.isRunning()).toBe(false);
      expect(processor.getActiveScopeIds()).toBeNull();

      // Second run: global processing without IDs
      await processor.startProcessing();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // A, C, E must now also be processed to ready
      expect(itemA.status).toBe('ready');
      expect(itemC.status).toBe('ready');
      expect(itemE.status).toBe('ready');
      expect(processor.getActiveScopeIds()).toBeNull();
    });

    it('cleans activeScopeIds after cancelAll() and allows subsequent global run', async () => {
      const itemA = createMockItem('A', 'pending');
      const itemB = createMockItem('B', 'pending');
      const itemC = createMockItem('C', 'pending');

      mockCartItems = [itemA, itemB, itemC];
      for (const id of ['A', 'B', 'C']) {
        mediaRegistry.registerLocalFile(id, new File(['audio'], `${id}.mp3`));
      }

      // Start scoped to B
      await processor.startProcessing(['B']);
      // Cancel during or after
      await processor.cancelAll();

      expect(processor.isRunning()).toBe(false);
      expect(processor.getActiveScopeIds()).toBeNull();

      // Reset itemB to pending for the subsequent run
      itemB.status = 'pending';

      // Global run must process all items
      await processor.startProcessing();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(itemA.status).toBe('ready');
      expect(itemB.status).toBe('ready');
      expect(itemC.status).toBe('ready');
    });

    it('handles invalid scope (non-existent ID) cleanly without blocking future executions', async () => {
      const itemA = createMockItem('A', 'pending');
      mockCartItems = [itemA];
      mediaRegistry.registerLocalFile('A', new File(['audio'], 'A.mp3'));

      // Start with non-existent ID
      await processor.startProcessing(['NO_EXISTE']);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(processor.isRunning()).toBe(false);
      expect(processor.getActiveScopeIds()).toBeNull();
      expect(itemA.status).toBe('pending');

      // Subsequent execution must work normally
      await processor.startProcessing();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(itemA.status).toBe('ready');
    });

    it('handles empty scope array by treating it as global processing', async () => {
      const itemA = createMockItem('A', 'pending');
      mockCartItems = [itemA];
      mediaRegistry.registerLocalFile('A', new File(['audio'], 'A.mp3'));

      await processor.startProcessing([]);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(itemA.status).toBe('ready');
      expect(processor.getActiveScopeIds()).toBeNull();
    });

    it('leaves failed and pending items outside scope untouched', async () => {
      const itemPending = createMockItem('A', 'pending');
      const itemFailed = createMockItem('B', 'failed');
      const itemScoped = createMockItem('C', 'pending');

      mockCartItems = [itemPending, itemFailed, itemScoped];
      mediaRegistry.registerLocalFile('C', new File(['audio'], 'C.mp3'));

      await processor.startProcessing(['C']);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(itemScoped.status).toBe('ready');
      expect(itemPending.status).toBe('pending');
      expect(itemFailed.status).toBe('failed');
    });
  });
});
