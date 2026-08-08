// @ts-ignore
import ID3Writer from 'browser-id3-writer';
import type { CartItem } from '../db/database';
import { mediaRegistry } from './mediaAssetRegistry';

/**
 * Helper to fetch a remote cover image URL and return it as an ArrayBuffer.
 */
async function fetchCoverAsArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch (err) {
    console.warn(`Could not fetch cover art from ${url}:`, err);
    return null;
  }
}

/**
 * Writes ID3v2 tags (Title, Artist, Album, Year, Genre, Track, and Cover Art)
 * directly into an MP3 Blob.
 *
 * @param itemId The cart item ID
 * @param mp3Blob The transcoded MP3 binary blob
 * @param metadata The metadata structure to apply
 */
export async function writeMetadata(
  itemId: string,
  mp3Blob: Blob,
  metadata: CartItem
): Promise<Blob> {
  try {
    const fileBuffer = await mp3Blob.arrayBuffer();
    const writer = new ID3Writer(fileBuffer);

    // Apply basic tags
    if (metadata.title) writer.setFrame('TIT2', metadata.title);
    if (metadata.artist) writer.setFrame('TPE1', [metadata.artist]);
    if (metadata.album) writer.setFrame('TALB', metadata.album);
    if (metadata.year) writer.setFrame('TYER', metadata.year);
    if (metadata.genre) writer.setFrame('TCON', [metadata.genre]);
    if (metadata.trackNumber) writer.setFrame('TRCK', metadata.trackNumber);

    // Attempt to write cover image
    let coverBuffer: ArrayBuffer | null = null;

    // Check if there is an in-memory cover blob
    // Wait, let's see if we have cover art in memory
    // In Phase 4, we will register user-provided custom covers.
    const customCover = mediaRegistry.getLocalFile(`cover_${itemId}`);
    if (customCover) {
      coverBuffer = await customCover.arrayBuffer();
    } else if (metadata.thumbnailUrl) {
      // Fallback to fetch thumbnail url (if allowed)
      coverBuffer = await fetchCoverAsArrayBuffer(metadata.thumbnailUrl);
    }

    if (coverBuffer) {
      writer.setFrame('APIC', {
        type: 3, // Cover front
        data: coverBuffer,
        description: 'Cover art',
        useReader: false
      });
    }

    writer.addTag();
    return new Blob([writer.arrayBuffer], { type: 'audio/mpeg' });
  } catch (err) {
    console.error('Failed to embed ID3 tags:', err);
    return mp3Blob; // Return untagged blob as fallback rather than failing entirely
  }
}
