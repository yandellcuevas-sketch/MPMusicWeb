import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cartService, parseFilename } from './cartService';
import { db } from '../db/database';
import { mediaRegistry } from './mediaAssetRegistry';

vi.mock('../db/database', () => {
  const mockCartTable = {
    put: vi.fn(),
    delete: vi.fn(),
    toArray: vi.fn(() => []),
    clear: vi.fn(),
  };
  const mockPlaylistsTable = {
    toArray: vi.fn(() => []),
    update: vi.fn(),
  };
  return {
    db: {
      cart: mockCartTable,
      playlists: mockPlaylistsTable,
      transaction: vi.fn((_mode, _tables, cb) => cb()),
    },
  };
});

describe('cartService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaRegistry.clear();
  });

  describe('parseFilename', () => {
    it('parses standard Artist - Song names', () => {
      const result = parseFilename('Queen - Bohemian Rhapsody.mp3');
      expect(result.artist).toBe('Queen');
      expect(result.title).toBe('Bohemian Rhapsody');
    });

    it('falls back when delimiter is missing', () => {
      const result = parseFilename('Bohemian Rhapsody.wav');
      expect(result.artist).toBe('Local Import');
      expect(result.title).toBe('Bohemian Rhapsody');
    });
  });

  describe('addToCart', () => {
    it('adds item to Dexie and registers local file in memory', async () => {
      const item = {
        id: '123',
        source: 'local' as const,
        title: 'Song',
        artist: 'Artist',
        duration: 180,
        outputFormat: 'mp3' as const,
        quality: '320' as const,
      };
      const file = new File([''], 'song.mp3');

      await cartService.addToCart(item, file);

      expect(db.cart.put).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '123',
          title: 'Song',
          artist: 'Artist',
          status: 'pending',
        })
      );
      expect(mediaRegistry.getLocalFile('123')).toBe(file);
    });
  });

  describe('removeFromCart', () => {
    it('removes from db and memory registry', async () => {
      const id = '123';
      const file = new File([''], 'song.mp3');
      mediaRegistry.registerLocalFile(id, file);

      await cartService.removeFromCart(id);

      expect(db.cart.delete).toHaveBeenCalledWith(id);
      expect(mediaRegistry.getLocalFile(id)).toBeUndefined();
    });
  });
});
