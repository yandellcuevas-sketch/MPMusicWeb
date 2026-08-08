import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cartService, parseFilename } from './cartService';
import { db } from '../db/database';
import { mediaRegistry } from './mediaAssetRegistry';

vi.mock('../db/database', () => {
  const mockCartTable = {
    put: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(async (id: string) => ({
      id,
      title: 'Mock Track',
      artist: 'Mock Artist',
      resolvedMedia: { mediaUrl: 'https://test.com/audio.mp3', confidence: 0.88 },
    })),
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
      audioResolutions: {
        get: vi.fn(),
        put: vi.fn(),
      },
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

  describe('addToCart & AudioResolver background trigger', () => {
    it('adds local file item to Dexie as pending and registers in memory', async () => {
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
          audioResolutionStatus: 'resolved',
          allowProcessing: true,
        })
      );
      expect(mediaRegistry.getLocalFile('123')).toBe(file);
    });

    it('sets audioResolutionStatus to resolving when adding YouTube track', async () => {
      const youtubeItem = {
        id: 'yt_123',
        source: 'youtube' as const,
        title: 'YouTube Track',
        artist: 'Channel',
        duration: 200,
        outputFormat: 'mp3' as const,
        quality: '320' as const,
      };

      await cartService.addToCart(youtubeItem);

      expect(db.cart.put).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'yt_123',
          source: 'youtube',
          audioResolutionStatus: 'resolving',
        })
      );
    });

    it('accepts ambiguous match on user review', async () => {
      await cartService.acceptResolutionMatch('yt_123');

      expect(db.cart.update).toHaveBeenCalledWith(
        'yt_123',
        expect.objectContaining({
          audioResolutionStatus: 'resolved',
          allowProcessing: true,
          status: 'pending',
          userReviewedMatch: true,
        })
      );
    });

    it('rejects ambiguous match on user review', async () => {
      await cartService.rejectResolutionMatch('yt_123');

      expect(db.cart.update).toHaveBeenCalledWith(
        'yt_123',
        expect.objectContaining({
          audioResolutionStatus: 'unavailable',
          allowProcessing: false,
          status: 'source_required',
          userReviewedMatch: false,
        })
      );
    });

    it('attaches local file and upgrades to resolved', async () => {
      const id = 'yt_123';
      const file = new File(['audio content'], 'track.mp3');

      await cartService.attachLocalFile(id, file);

      expect(mediaRegistry.getLocalFile(id)).toBe(file);
      expect(db.cart.update).toHaveBeenCalledWith(
        id,
        expect.objectContaining({
          source: 'local',
          status: 'pending',
          audioResolutionStatus: 'resolved',
          allowProcessing: true,
          fileSizeEstimate: file.size,
        })
      );
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
