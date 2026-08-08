import { describe, it, expect } from 'vitest';
import { sanitizeFilename, normalizeForCarStereo } from './usbService';

describe('usbService utility functions', () => {
  describe('sanitizeFilename', () => {
    it('removes illegal characters from Windows filenames', () => {
      expect(sanitizeFilename('Queen: Bohemian Rhapsody?')).toBe('Queen_ Bohemian Rhapsody_');
      expect(sanitizeFilename('Artist/Album/Song')).toBe('Artist_Album_Song');
      expect(sanitizeFilename('Bad*Character?<>|')).toBe('Bad_Character____');
    });

    it('returns Unknown for empty inputs', () => {
      expect(sanitizeFilename('')).toBe('Unknown');
    });
  });

  describe('normalizeForCarStereo', () => {
    it('removes accents and keeps clean ASCII characters', () => {
      // "Canción" -> "Cancion", "Mötorhead" -> "Motorhead"
      expect(normalizeForCarStereo('Canción de Lofi')).toBe('Cancion de Lofi');
      expect(normalizeForCarStereo('Mötorhead')).toBe('Motorhead');
    });

    it('limits filename length to avoid deep path errors', () => {
      const longName = 'A'.repeat(100);
      expect(normalizeForCarStereo(longName).length).toBe(50);
    });
  });
});
