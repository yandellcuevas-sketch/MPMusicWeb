import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueProcessor } from './queueProcessor';
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

function createMockItem(id: string, status: CartItem['status'] = 'pending'): CartItem {
  return {
    id,
    source: 'local',
    title: `Title ${id}`,
    artist: `Artist ${id}`,
    artistNormalized: `artist ${id}`,
    duration: 180,
    outputFormat: 'mp3',
    quality: '320',
    status,
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

  it('runs transcode when file is local', async () => {
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

  it('sets failed status on processing exception', async () => {
    const item = createMockItem('item_err', 'pending');
    mockCartItems = [item];

    // No file registered in mediaRegistry -> will trigger an error
    await processor.processItem(item);

    expect(db.cart.update).toHaveBeenCalledWith(
      'item_err',
      expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringContaining('not found'),
      })
    );
  });

  describe('Scoped Processing (startProcessing with selectedIds)', () => {
    it('processes ONLY selected items (B, D) and leaves others (A, C, E) untouched', async () => {
      const itemA = createMockItem('A', 'pending');
      const itemB = createMockItem('B', 'pending');
      const itemC = createMockItem('C', 'pending');
      const itemD = createMockItem('D', 'pending');
      const itemE = createMockItem('E', 'pending');

      mockCartItems = [itemA, itemB, itemC, itemD, itemE];

      // Register mock files for all items
      for (const id of ['A', 'B', 'C', 'D', 'E']) {
        mediaRegistry.registerLocalFile(id, new File(['audio'], `${id}.mp3`));
      }

      // Start processing scoped to B and D only
      await processor.startProcessing(['B', 'D']);

      // Wait a tick for async execution loop
      await new Promise((resolve) => setTimeout(resolve, 50));

      // B and D must be ready
      expect(itemB.status).toBe('ready');
      expect(itemD.status).toBe('ready');

      // A, C, E must remain pending
      expect(itemA.status).toBe('pending');
      expect(itemC.status).toBe('pending');
      expect(itemE.status).toBe('pending');
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

    it('handles selection with non-existent ID gracefully', async () => {
      const itemA = createMockItem('A', 'pending');
      mockCartItems = [itemA];
      mediaRegistry.registerLocalFile('A', new File(['audio'], 'A.mp3'));

      // Non-existent ID 'Z' selected
      await processor.startProcessing(['Z']);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Item A is untouched because it was not in scope
      expect(itemA.status).toBe('pending');
      expect(processor.isRunning()).toBe(false);
    });

    it('processes all items when startProcessing is called without IDs (global queue)', async () => {
      const item1 = createMockItem('1', 'pending');
      const item2 = createMockItem('2', 'pending');

      mockCartItems = [item1, item2];
      mediaRegistry.registerLocalFile('1', new File(['audio'], '1.mp3'));
      mediaRegistry.registerLocalFile('2', new File(['audio'], '2.mp3'));

      await processor.startProcessing(); // No IDs passed -> global processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(item1.status).toBe('ready');
      expect(item2.status).toBe('ready');
    });

    it('cancels only scoped items when cancelAll is called during scoped processing', async () => {
      const itemA = createMockItem('A', 'pending');
      const itemB = createMockItem('B', 'pending');
      mockCartItems = [itemA, itemB];

      // Start processing scoped to A
      await processor.startProcessing(['A']);

      // Call cancelAll
      await processor.cancelAll();

      // Item A should be cancelled
      expect(itemA.status).toBe('cancelled');
      // Item B was outside scope, remains pending
      expect(itemB.status).toBe('pending');
    });
  });
});
