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

// Mock global fetch for remote stream downloading
global.fetch = vi.fn(async (_url: string) => {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    blob: async () => new Blob(['audio_stream'], { type: 'audio/mpeg' }),
  } as any;
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
    it('returns false for YouTube items without local file or resolved audio', () => {
      const item = createMockItem('yt_1', 'source_required', 'youtube', false);
      expect(canProcessItem(item)).toBe(false);
    });

    it('returns true for YouTube items with audioResolutionStatus resolved and mediaUrl', () => {
      const item = createMockItem('yt_resolved', 'pending', 'youtube', true);
      item.audioResolutionStatus = 'resolved';
      item.resolvedMedia = {
        provider: 'archive_org',
        mediaUrl: 'https://archive.org/download/item/track.mp3',
        confidence: 0.95,
        resolvedAt: Date.now(),
      };
      expect(canProcessItem(item)).toBe(true);
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

    expect(db.cart.update).toHaveBeenCalledWith('item_1', {
      status: 'processing',
      processingStatus: 'converting',
      progress: 0,
    });
    expect(mediaProcessor.convert).toHaveBeenCalledWith(file, 'mp3', '320', expect.any(Function), 'item_1');
    expect(db.cart.update).toHaveBeenCalledWith('item_1', {
      status: 'ready',
      processingStatus: 'ready',
      progress: 100,
      errorMessage: undefined,
    });
    expect(db.history.put).toHaveBeenCalled();
  });

  it('downloads resolved audio and runs transcode for resolved YouTube tracks', async () => {
    const ytItem = createMockItem('yt_resolved', 'pending', 'youtube', true);
    ytItem.audioResolutionStatus = 'resolved';
    ytItem.resolvedMedia = {
      provider: 'archive_org',
      mediaUrl: 'https://archive.org/download/item/spectre.mp3',
      confidence: 0.95,
      resolvedAt: Date.now(),
    };
    mockCartItems = [ytItem];

    await processor.processItem(ytItem);

    expect(global.fetch).toHaveBeenCalledWith('https://archive.org/download/item/spectre.mp3');
    expect(mediaProcessor.convert).toHaveBeenCalled();
    expect(db.cart.update).toHaveBeenCalledWith('yt_resolved', {
      status: 'ready',
      processingStatus: 'ready',
      progress: 100,
      errorMessage: undefined,
    });
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
