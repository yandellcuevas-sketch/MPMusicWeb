import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioResolver } from './AudioResolver';
import type { AudioProvider, AudioQuery, CandidateTrack } from './types';
import { db } from '../../db/database';

let mockResolutions: any[] = [];
let mockCartItems: any[] = [];

vi.mock('../../db/database', () => {
  return {
    db: {
      audioResolutions: {
        get: vi.fn(async (id: string) => mockResolutions.find((r) => r.youtubeId === id)),
        put: vi.fn(async (entry: any) => {
          const idx = mockResolutions.findIndex((r) => r.youtubeId === entry.youtubeId);
          if (idx >= 0) mockResolutions[idx] = entry;
          else mockResolutions.push(entry);
        }),
      },
      cart: {
        update: vi.fn(async (id: string, updates: any) => {
          const item = mockCartItems.find((i) => i.id === id);
          if (item) Object.assign(item, updates);
        }),
      },
    },
  };
});

describe('AudioResolver Engine', () => {
  let mockProvider: AudioProvider;
  let resolver: AudioResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolutions = [];
    mockCartItems = [];

    mockProvider = {
      name: 'mock_legal_provider',
      search: vi.fn(async (_query: AudioQuery): Promise<CandidateTrack[]> => []),
    };

    resolver = new AudioResolver([mockProvider]);
  });

  it('Case A: Exact match resolves with confidence >= 0.92 (AUTO RESOLVED)', async () => {
    const query: AudioQuery = {
      youtubeId: 'yt_spectre',
      title: 'Spectre (Official Video)',
      artist: 'Alan Walker',
      duration: 226,
    };

    (mockProvider.search as any).mockResolvedValueOnce([
      {
        provider: 'mock_legal_provider',
        providerItemId: 'alan-walker-spectre',
        title: 'Spectre',
        artist: 'Alan Walker',
        duration: 226,
        mediaUrl: 'https://archive.org/download/item/spectre.mp3',
        license: {
          name: 'Creative Commons / Verified Open License',
          url: 'https://creativecommons.org/licenses/by/3.0/',
          verified: true,
        },
      },
    ]);

    const result = await resolver.resolve(query);

    expect(result.status).toBe('resolved');
    expect(result.confidence).toBeGreaterThanOrEqual(0.92);
    expect(result.mediaUrl).toBe('https://archive.org/download/item/spectre.mp3');
    expect(result.license?.verified).toBe(true);

    // Verify it was cached in Dexie
    expect(db.audioResolutions.put).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubeId: 'yt_spectre',
        confidence: expect.any(Number),
        mediaUrl: 'https://archive.org/download/item/spectre.mp3',
      })
    );
  });

  it('Case B: Close but modified/cover match is flagged as ambiguous or unavailable (NEVER auto-resolved)', async () => {
    const query: AudioQuery = {
      youtubeId: 'yt_monaco',
      title: 'Monaco',
      artist: 'Bad Bunny',
      duration: 267,
    };

    // Candidate is a cover with different timing and penalty term
    (mockProvider.search as any).mockResolvedValueOnce([
      {
        provider: 'mock_legal_provider',
        providerItemId: 'monaco-cover',
        title: 'Monaco (Cover Tribute)',
        artist: 'Various Artists',
        duration: 250,
        mediaUrl: 'https://archive.org/download/item/cover.mp3',
      },
    ]);

    const result = await resolver.resolve(query);

    expect(result.status).toBe('unavailable');
    expect(result.confidence).toBeLessThan(0.80);
  });

  it('Case C: Query with no matching authorized audio returns unavailable', async () => {
    const query: AudioQuery = {
      youtubeId: 'yt_unknown_song',
      title: 'Very Obscure Track With No Mirror',
      artist: 'Unknown Artist',
      duration: 180,
    };

    (mockProvider.search as any).mockResolvedValueOnce([]);

    const result = await resolver.resolve(query);

    expect(result.status).toBe('unavailable');
    expect(result.confidence).toBe(0);
  });

  it('Cache Hit: Uses persistent IndexedDB cache on repeat lookups without calling providers', async () => {
    const query: AudioQuery = {
      youtubeId: 'yt_cached_1',
      title: 'Hope',
      artist: 'Tobu',
      duration: 283,
    };

    mockResolutions.push({
      youtubeId: 'yt_cached_1',
      provider: 'cached_provider',
      mediaUrl: 'https://cdn.example.com/hope.mp3',
      confidence: 0.96,
      matchedTitle: 'Hope',
      matchedArtist: 'Tobu',
      matchedDuration: 283,
      resolvedAt: Date.now(),
    });

    const result = await resolver.resolve(query);

    expect(result.status).toBe('resolved');
    expect(result.mediaUrl).toBe('https://cdn.example.com/hope.mp3');
    // Provider search must NOT have been called due to cache hit
    expect(mockProvider.search).not.toHaveBeenCalled();
  });
});
