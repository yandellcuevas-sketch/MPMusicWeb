import { db } from '../db/database';
import type { CartItem } from '../db/database';
import { mediaRegistry } from './mediaAssetRegistry';
import { normalizeArtist } from '../utils/artistUtils';
import { audioResolver } from './audioResolver/AudioResolver';

/**
 * Parses file names to estimate Artist and Title.
 * E.g., "Queen - Bohemian Rhapsody.mp3" -> Artist: "Queen", Title: "Bohemian Rhapsody"
 */
export function parseFilename(filename: string): { title: string; artist: string } {
  const cleanName = filename.replace(/\.[^/.]+$/, ''); // Remove extension
  const parts = cleanName.split(/\s*-\s*/);
  if (parts.length > 1) {
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    return { title, artist };
  }
  return { title: cleanName.trim(), artist: 'Local Import' };
}

/**
 * Dynamically retrieves duration of an audio/video file using browser Audio element.
 */
export function getMediaDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof Audio === 'undefined') {
      resolve(0);
      return;
    }
    try {
      const objectUrl = URL.createObjectURL(file);
      const audio = new Audio();
      audio.src = objectUrl;

      const cleanup = () => {
        try { URL.revokeObjectURL(objectUrl); } catch {}
        audio.onloadedmetadata = null;
        audio.onerror = null;
      };

      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        cleanup();
        resolve(isNaN(duration) || duration === Infinity ? 0 : duration);
      };

      audio.onerror = () => {
        cleanup();
        resolve(0);
      };
    } catch {
      resolve(0);
    }
  });
}

export class CartService {
  /**
   * Scans the cart for potential duplicates based on titles, artists, normalized hashes, or sourceIds.
   */
  async checkDuplicates(
    title: string,
    artist: string,
    duration: number,
    sourceId?: string
  ): Promise<CartItem[]> {
    const normalizedTitle = title.toLowerCase().trim();
    const normalizedArtist = normalizeArtist(artist);
    const toleranceSec = 3;

    const allItems = await db.cart.toArray();

    return allItems.filter((item) => {
      // 1. Match by sourceId if available
      if (sourceId && item.sourceId === sourceId) {
        return true;
      }

      // 2. Match by normalized title/artist and duration close match
      const titleMatch = item.title.toLowerCase().trim() === normalizedTitle;
      const artistMatch = normalizeArtist(item.artist) === normalizedArtist;
      const durationMatch = Math.abs(item.duration - duration) <= toleranceSec;

      return titleMatch && artistMatch && durationMatch;
    });
  }

  /**
   * Adds an item to the persistent cart. If it has a local file, registers it in memory.
   * If it's a YouTube track, initiates background audio resolution automatically.
   */
  async addToCart(
    itemData: Omit<CartItem, 'addedAt' | 'status' | 'artistNormalized'> & { status?: CartItem['status'] },
    file?: File
  ): Promise<string> {
    const id = itemData.id;
    const addedAt = Date.now();

    const isLocal = itemData.source === 'local' || Boolean(file);
    const isDirect = itemData.source === 'direct';

    const audioResolutionStatus = isLocal || isDirect ? 'resolved' : 'resolving';
    const allowProcessing = isLocal || isDirect || itemData.allowProcessing === true;
    const status: CartItem['status'] = isLocal || isDirect ? 'pending' : 'pending';

    const newItem: CartItem = {
      ...itemData,
      artistNormalized: normalizeArtist(itemData.artist),
      addedAt,
      status,
      audioResolutionStatus,
      allowProcessing,
    };

    // If local file provided, register in memory
    if (file) {
      mediaRegistry.registerLocalFile(id, file);
      newItem.fileSizeEstimate = file.size;
      newItem.status = 'pending';
      newItem.audioResolutionStatus = 'resolved';
      newItem.allowProcessing = true;
    }

    await db.cart.put(newItem);

    // If it's a YouTube track without local binary, resolve in background
    if (!isLocal && !isDirect) {
      // Non-blocking background trigger
      audioResolver.resolveCartItem(newItem).catch((err) => {
        console.error('Background audio resolution failed for:', newItem.title, err);
      });
    }

    return id;
  }

  /**
   * Retries audio resolution for a cart item.
   */
  async retryResolution(id: string): Promise<void> {
    const item = await db.cart.get(id);
    if (!item) return;

    await db.cart.update(id, {
      audioResolutionStatus: 'resolving',
      errorMessage: undefined,
    });

    await audioResolver.resolveCartItem(item);
  }

  /**
   * Accepts an ambiguous match upon user review.
   */
  async acceptResolutionMatch(id: string): Promise<void> {
    const item = await db.cart.get(id);
    if (!item || !item.resolvedMedia) return;

    await db.cart.update(id, {
      audioResolutionStatus: 'resolved',
      allowProcessing: true,
      status: 'pending',
      userReviewedMatch: true,
    });
  }

  /**
   * Rejects an ambiguous match upon user review.
   */
  async rejectResolutionMatch(id: string): Promise<void> {
    await db.cart.update(id, {
      audioResolutionStatus: 'unavailable',
      allowProcessing: false,
      status: 'source_required',
      userReviewedMatch: false,
    });
  }

  /**
   * Attaches a real local audio/video file to an existing item (e.g. a YouTube track without match).
   * Upgrades the item to fully processable ('pending').
   */
  async attachLocalFile(id: string, file: File): Promise<void> {
    mediaRegistry.registerLocalFile(id, file);
    const duration = await getMediaDuration(file);
    await db.cart.update(id, {
      source: 'local',
      status: 'pending',
      audioResolutionStatus: 'resolved',
      allowProcessing: true,
      fileSizeEstimate: file.size,
      duration: duration > 0 ? duration : undefined,
      errorMessage: undefined,
    });
  }

  /**
   * Imports a local file directly: parses metadata, extracts duration, checks duplicates, and adds it.
   */
  async importLocalFile(file: File, options?: { resolveConflict?: 'keep' | 'replace' | 'skip' }): Promise<{ id: string; duplicateOf?: CartItem[] }> {
    const { title, artist } = parseFilename(file.name);
    const duration = await getMediaDuration(file);
    const id = `local_${Math.random().toString(36).substring(7)}_${Date.now()}`;
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    // Check duplicates
    const duplicates = await this.checkDuplicates(title, artist, duration);
    if (duplicates.length > 0 && !options?.resolveConflict) {
      return { id: '', duplicateOf: duplicates };
    }

    if (duplicates.length > 0 && options?.resolveConflict === 'skip') {
      return { id: '', duplicateOf: duplicates };
    }

    if (duplicates.length > 0 && options?.resolveConflict === 'replace') {
      for (const dup of duplicates) {
        await this.removeFromCart(dup.id);
      }
    }

    const outputFormat = ['mp3', 'wav', 'flac', 'm4a', 'mp4'].includes(extension)
      ? (extension as any)
      : 'mp3';

    const cartId = await this.addToCart(
      {
        id,
        source: 'local',
        title,
        artist,
        duration,
        outputFormat,
        quality: '320',
        allowProcessing: true,
      },
      file
    );

    return { id: cartId };
  }

  /**
   * Removes an item from the cart and its binary registry.
   */
  async removeFromCart(id: string) {
    mediaRegistry.removeLocalFile(id);
    mediaRegistry.removeProcessedBlob(id);
    await db.cart.delete(id);

    // Remove reference from playlists
    const playlists = await db.playlists.toArray();
    for (const playlist of playlists) {
      if (playlist.itemIds.includes(id)) {
        const newItemIds = playlist.itemIds.filter((itemId) => itemId !== id);
        await db.playlists.update(playlist.id, { itemIds: newItemIds });
      }
    }
  }

  /**
   * Reorders the cart item list by updating timestamps to match the new order array.
   */
  async reorderCart(orderedIds: string[]) {
    const now = Date.now();
    await db.transaction('rw', db.cart, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.cart.update(orderedIds[i], { addedAt: now - (orderedIds.length - i) * 1000 });
      }
    });
  }

  /**
   * Clears all items in the cart and memory registry.
   */
  async clearCart() {
    mediaRegistry.clear();
    await db.cart.clear();
  }
}

export const cartService = new CartService();
