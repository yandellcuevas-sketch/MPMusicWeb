import { describe, it, expect } from 'vitest';
import { scoreCandidate, cleanTitle, calculatePenalty } from './scorer';
import type { AudioQuery, CandidateTrack } from '../types';

describe('AudioResolver Scorer', () => {
  describe('cleanTitle', () => {
    it('removes YouTube boilerplate and annotations', () => {
      expect(cleanTitle('Alan Walker - The Spectre (Official Music Video)')).toBe('alan walker the spectre');
      expect(cleanTitle('Bad Bunny - MONACO [Lyric Video 4K]')).toBe('bad bunny monaco');
      expect(cleanTitle('Tobu - Hope [NCS Release] | Official Video')).toBe('tobu hope');
    });
  });

  describe('calculatePenalty', () => {
    it('detects unrequested modifier terms like cover, remix, instrumental', () => {
      const { penalty, detectedTerms } = calculatePenalty('Bad Bunny Monaco', 'Bad Bunny - Monaco (Cover)');
      expect(penalty).toBeGreaterThanOrEqual(0.35);
      expect(detectedTerms).toContain('cover');
    });

    it('does not penalize when the original query also requested a remix', () => {
      const { penalty, detectedTerms } = calculatePenalty('Dua Lipa Levitating Remix', 'Dua Lipa - Levitating (Remix)');
      expect(penalty).toBe(0);
      expect(detectedTerms.length).toBe(0);
    });
  });

  describe('scoreCandidate evaluation & thresholds', () => {
    it('auto-resolves exact matches with high confidence (>= 0.92)', () => {
      const query: AudioQuery = {
        youtubeId: 'yt_123',
        title: 'Spectre (Official Video)',
        artist: 'Alan Walker',
        duration: 226,
      };

      const candidate: CandidateTrack = {
        provider: 'archive_org',
        providerItemId: 'alan-walker-spectre',
        title: 'Spectre',
        artist: 'Alan Walker',
        duration: 226,
        mediaUrl: 'https://archive.org/download/item/spectre.mp3',
      };

      const score = scoreCandidate(query, candidate);
      expect(score.compositeConfidence).toBeGreaterThanOrEqual(0.92);
      expect(score.status).toBe('resolved');
    });

    it('penalizes and blocks auto-resolution for covers or remixes', () => {
      const query: AudioQuery = {
        youtubeId: 'yt_monaco',
        title: 'Monaco',
        artist: 'Bad Bunny',
        duration: 267,
      };

      const candidateCover: CandidateTrack = {
        provider: 'archive_org',
        providerItemId: 'monaco-cover-123',
        title: 'Monaco (Acoustic Cover)',
        artist: 'Bad Bunny',
        duration: 265,
        mediaUrl: 'https://archive.org/download/item/cover.mp3',
      };

      const score = scoreCandidate(query, candidateCover);
      expect(score.penaltyScore).toBeGreaterThan(0);
      expect(score.compositeConfidence).toBeLessThan(0.80);
      expect(score.status).toBe('unavailable');
    });

    it('clamps confidence below auto-match threshold if artist similarity is low', () => {
      const query: AudioQuery = {
        youtubeId: 'yt_456',
        title: 'Hope',
        artist: 'Tobu',
        duration: 283,
      };

      const candidateDifferentArtist: CandidateTrack = {
        provider: 'archive_org',
        providerItemId: 'hope-random',
        title: 'Hope',
        artist: 'Completely Different Artist',
        duration: 283,
        mediaUrl: 'https://archive.org/download/item/hope.mp3',
      };

      const score = scoreCandidate(query, candidateDifferentArtist);
      expect(score.compositeConfidence).toBeLessThan(0.80);
      expect(score.status).not.toBe('resolved');
    });

    it('flags close matches with title variation as ambiguous for user review (0.80 - 0.919)', () => {
      const query: AudioQuery = {
        youtubeId: 'yt_789',
        title: 'The Spectre',
        artist: 'Alan Walker',
        duration: 226,
      };

      const candidateSlightlyDifferent: CandidateTrack = {
        provider: 'archive_org',
        providerItemId: 'spectre-track',
        title: 'Spectre',
        artist: 'Alan Walker',
        duration: 226,
        mediaUrl: 'https://archive.org/download/item/spectre.mp3',
      };

      const score = scoreCandidate(query, candidateSlightlyDifferent);
      expect(score.compositeConfidence).toBeGreaterThanOrEqual(0.80);
      expect(score.compositeConfidence).toBeLessThan(0.92);
      expect(score.status).toBe('ambiguous');
    });
  });
});
