import { describe, it, expect } from 'vitest';
import { youtubeService, parseISO8601Duration } from './youtubeService';

describe('youtubeService', () => {
  describe('parseISO8601Duration', () => {
    it('correctly parses minutes and seconds', () => {
      expect(parseISO8601Duration('PT4M21S')).toBe(261);
    });

    it('correctly parses hours, minutes and seconds', () => {
      expect(parseISO8601Duration('PT1H2M30S')).toBe(3750);
    });

    it('correctly parses only seconds', () => {
      expect(parseISO8601Duration('PT45S')).toBe(45);
    });

    it('correctly parses only minutes', () => {
      expect(parseISO8601Duration('PT3M')).toBe(180);
    });

    it('returns 0 for invalid format', () => {
      expect(parseISO8601Duration('invalid')).toBe(0);
    });
  });

  describe('search without API Key', () => {
    it('returns curated matches when query matches', async () => {
      const results = await youtubeService.search('Hope');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Hope');
      expect(results[0].artist).toBe('Tobu');
    });

    it('returns all curated tracks on empty query', async () => {
      const results = await youtubeService.search('');
      expect(results.length).toBe(5);
    });
  });

  describe('resolveUrl', () => {
    it('correctly parses YouTube links and returns stub info without API key', async () => {
      const ytUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const result = await youtubeService.resolveUrl(ytUrl);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('dQw4w9WgXcQ');
      expect(result?.source).toBe('youtube');
    });

    it('correctly resolves direct audio URLs', async () => {
      const directUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      const result = await youtubeService.resolveUrl(directUrl);
      expect(result).not.toBeNull();
      expect(result?.source).toBe('direct');
      expect(result?.title).toBe('SoundHelix-Song-1');
      expect(result?.allowProcessing).toBe(true);
    });
  });
});
