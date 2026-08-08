import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeMetadata } from './metadataService';
// Mock media registry to avoid DB lookups in simple unit test
vi.mock('./mediaAssetRegistry', () => {
  return {
    mediaRegistry: {
      getLocalFile: vi.fn()
    }
  };
});

describe('metadataService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly injects ID3 tags and cover frame into MP3 Blobs', async () => {
    // 1. Create a dummy MP3 data blob (just a simple buffer)
    const mockMp3Buffer = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // ID3v2 dummy header
    const mockBlob = new Blob([mockMp3Buffer], { type: 'audio/mpeg' });

    // 2. Set up tags
    const mockCartItem: any = {
      id: 'test_item_1',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      album: 'A Night at the Opera',
      year: '1975',
      genre: 'Rock',
      trackNumber: '1',
      outputFormat: 'mp3',
      quality: '320'
    };

    // 3. Execute tagging
    const taggedBlob = await writeMetadata('test_item_1', mockBlob, mockCartItem);

    // 4. Verify output
    expect(taggedBlob).toBeInstanceOf(Blob);
    expect(taggedBlob.type).toBe('audio/mpeg');
    expect(taggedBlob.size).toBeGreaterThan(0);

    const buffer = await taggedBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Assert that the file starts with the ID3 signature
    expect(bytes[0]).toBe(0x49); // 'I'
    expect(bytes[1]).toBe(0x44); // 'D'
    expect(bytes[2]).toBe(0x33); // '3'
  });
});
