import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueProcessor } from './queueProcessor';
import { db } from '../db/database';
import { mediaRegistry } from './mediaAssetRegistry';
import { mediaProcessor } from './wasmMediaProcessor';

vi.mock('../db/database', () => {
  const mockCartTable = {
    update: vi.fn(),
    sortBy: vi.fn(() => []),
    where: vi.fn(() => ({
      anyOf: vi.fn(() => ({
        sortBy: vi.fn(() => [])
      }))
    }))
  };
  const mockHistoryTable = {
    put: vi.fn()
  };
  const mockSettingsTable = {
    get: vi.fn(() => ({ concurrencyLimit: 2 }))
  };
  return {
    db: {
      cart: mockCartTable,
      history: mockHistoryTable,
      settings: mockSettingsTable,
      transaction: vi.fn((_mode, _tables, cb) => cb())
    }
  };
});

vi.mock('./wasmMediaProcessor', () => {
  return {
    mediaProcessor: {
      initialize: vi.fn(() => Promise.resolve()),
      convert: vi.fn(() => Promise.resolve(new Blob(['test'], { type: 'audio/mpeg' }))),
      cancel: vi.fn(() => Promise.resolve())
    }
  };
});

vi.mock('./metadataService', () => {
  return {
    writeMetadata: vi.fn((_id, blob, _item) => Promise.resolve(blob))
  };
});

describe('queueProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaRegistry.clear();
  });

  it('runs transcode when file is local', async () => {
    const item = {
      id: 'item_1',
      source: 'local' as const,
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      duration: 300,
      outputFormat: 'mp3' as const,
      quality: '320' as const,
      status: 'pending' as const,
      addedAt: Date.now()
    };

    const file = new File(['audio'], 'bohemian.mp3');
    mediaRegistry.registerLocalFile('item_1', file);

    await queueProcessor.processItem(item);

    expect(db.cart.update).toHaveBeenCalledWith('item_1', { status: 'processing', progress: 0 });
    expect(mediaProcessor.convert).toHaveBeenCalledWith(file, 'mp3', '320', expect.any(Function));
    expect(db.cart.update).toHaveBeenCalledWith('item_1', { status: 'ready', progress: 100 });
    expect(db.history.put).toHaveBeenCalled();
  });

  it('sets failed status on processing exception', async () => {
    const item = {
      id: 'item_err',
      source: 'local' as const,
      title: 'Bad Track',
      artist: 'Error Maker',
      duration: 100,
      outputFormat: 'mp3' as const,
      quality: '192' as const,
      status: 'pending' as const,
      addedAt: Date.now()
    };

    // No file registered in mediaRegistry -> will trigger an error

    await queueProcessor.processItem(item);

    expect(db.cart.update).toHaveBeenCalledWith('item_err', expect.objectContaining({
      status: 'failed',
      errorMessage: expect.stringContaining('not found')
    }));
  });
});
