import { describe, it, expect } from 'vitest';
import {
  normalizeArtist,
  groupByArtist,
  getArtistSummary,
  formatDuration,
  getArtistInitials,
  getArtistHue
} from './artistUtils';

describe('normalizeArtist', () => {
  it('lowercases and trims', () => {
    expect(normalizeArtist('Bad Bunny ')).toBe('bad bunny');
    expect(normalizeArtist('BAD BUNNY')).toBe('bad bunny');
    expect(normalizeArtist('  Feid  ')).toBe('feid');
  });

  it('collapses multiple internal spaces', () => {
    expect(normalizeArtist('bad  bunny')).toBe('bad bunny');
  });

  it('handles empty string', () => {
    expect(normalizeArtist('')).toBe('unknown');
  });

  it('deduplicates variants of the same artist', () => {
    const variants = ['Bad Bunny', 'BAD BUNNY', 'bad bunny', 'Bad Bunny '];
    const normalized = new Set(variants.map(normalizeArtist));
    expect(normalized.size).toBe(1);
  });
});

describe('groupByArtist', () => {
  it('groups tracks by normalized artist key', () => {
    const tracks = [
      { artist: 'Bad Bunny', title: 'Monaco', duration: 200 },
      { artist: 'BAD BUNNY', title: 'Neverita', duration: 180 },
      { artist: 'Feid', title: 'Classy 101', duration: 210 },
    ];

    const grouped = groupByArtist(tracks);
    expect(grouped.size).toBe(2);
    expect(grouped.get('bad bunny')?.items.length).toBe(2);
    expect(grouped.get('feid')?.items.length).toBe(1);
  });

  it('preserves original display name from first occurrence', () => {
    const tracks = [
      { artist: 'El Alfa', title: 'Track 1', duration: 100 },
    ];
    const grouped = groupByArtist(tracks);
    expect(grouped.get('el alfa')?.displayName).toBe('El Alfa');
  });
});

describe('getArtistSummary', () => {
  it('returns sorted array by count descending', () => {
    const tracks = [
      { artist: 'Feid', duration: 200 },
      { artist: 'Bad Bunny', duration: 180 },
      { artist: 'Bad Bunny', duration: 190 },
      { artist: 'Bad Bunny', duration: 200 },
    ];
    const summary = getArtistSummary(tracks);
    expect(summary[0].key).toBe('bad bunny');
    expect(summary[0].count).toBe(3);
    expect(summary[1].key).toBe('feid');
    expect(summary[1].count).toBe(1);
  });

  it('calculates total duration correctly', () => {
    const tracks = [
      { artist: 'Bad Bunny', duration: 100 },
      { artist: 'Bad Bunny', duration: 200 },
    ];
    const summary = getArtistSummary(tracks);
    expect(summary[0].totalDuration).toBe(300);
  });
});

describe('formatDuration', () => {
  it('formats seconds under 1 hour', () => {
    expect(formatDuration(3600 - 1)).toMatch(/59m/);
  });

  it('formats hours correctly', () => {
    expect(formatDuration(3661)).toBe('1h 1m');
    expect(formatDuration(7200)).toBe('2h 0m');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0m');
  });
});

describe('getArtistInitials', () => {
  it('returns two letters for two-word names', () => {
    expect(getArtistInitials('Bad Bunny')).toBe('BB');
    expect(getArtistInitials('El Alfa')).toBe('EA');
  });

  it('returns first two letters for single names', () => {
    expect(getArtistInitials('Feid')).toBe('FE');
  });

  it('handles empty string', () => {
    expect(getArtistInitials('')).toBe('??');
  });
});

describe('getArtistHue', () => {
  it('returns a number between 0 and 359', () => {
    const hue = getArtistHue('Bad Bunny');
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  it('is deterministic for same input', () => {
    expect(getArtistHue('Feid')).toBe(getArtistHue('Feid'));
  });

  it('produces different hues for different artists', () => {
    const h1 = getArtistHue('Bad Bunny');
    const h2 = getArtistHue('El Alfa');
    expect(h1).not.toBe(h2);
  });
});
