import { db } from '../db/database';
import type { CartItem } from '../db/database';
import { mediaRegistry } from './mediaAssetRegistry';
import { mediaProcessor } from './wasmMediaProcessor';
import { writeMetadata } from './metadataService'; // Placeholder for Phase 4

/**
 * Checks if a CartItem has an available media source to transcode.
 */
export function canProcessItem(item: CartItem): boolean {
  if (item.status === 'source_required') return false;
  if (item.allowProcessing === false) return false;
  if (item.source === 'local') {
    return mediaRegistry.hasLocalFile(item.id);
  }
  if (item.source === 'direct' && item.sourceUrl) {
    return true;
  }
  if (item.source === 'youtube') {
    return mediaRegistry.hasLocalFile(item.id);
  }
  return false;
}

export class QueueProcessor {
  private activeCount = 0;
  private running = false;
  private cancelFlags = new Map<string, boolean>();
  private activeScopeIds: Set<string> | null = null;

  /**
   * Checks whether a CartItem can be processed by FFmpeg.
   */
  canProcess(item: CartItem): boolean {
    return canProcessItem(item);
  }

  /**
   * Starts processing the cart queue.
   * If `ids` is provided and non-empty, only processes items whose ID is in the list.
   * If `ids` is undefined, null, or empty, processes all eligible items in the cart (global queue).
   */
  async startProcessing(ids?: string[]) {
    if (this.running) return;
    this.running = true;

    if (ids && ids.length > 0) {
      this.activeScopeIds = new Set(ids);
    } else {
      this.activeScopeIds = null;
    }

    try {
      // Initialize media processor first
      await mediaProcessor.initialize();
    } catch (err) {
      console.error('Failed to initialize media processor:', err);
      this.running = false;
      this.activeScopeIds = null;
      return;
    }

    this.processNext();
  }

  /**
   * Stops the queue processor. Active tasks will continue but no new tasks start.
   */
  stopProcessing() {
    this.running = false;
  }

  /**
   * Returns whether the processor is currently running.
   */
  isRunning() {
    return this.running;
  }

  /**
   * Returns a copy of active scope IDs (or null if in global mode).
   */
  getActiveScopeIds(): Set<string> | null {
    return this.activeScopeIds ? new Set(this.activeScopeIds) : null;
  }

  /**
   * Process individual item.
   */
  async processItem(item: CartItem) {
    const id = item.id;
    this.cancelFlags.set(id, false);

    // Validate that input data is available before invoking FFmpeg
    if (!this.canProcess(item)) {
      await db.cart.update(id, {
        status: 'source_required',
        errorMessage: 'Source file required before processing. Attach a local audio/video file.',
      });
      return;
    }

    try {
      // 1. Fetch direct URL file or load from memory registry
      let inputData: File | Blob | null = null;

      if (item.source === 'local' || item.source === 'youtube') {
        inputData = mediaRegistry.getLocalFile(id) || null;
      } else if (item.source === 'direct' && item.sourceUrl) {
        // Update status to preparing (fetching remote file)
        await db.cart.update(id, { status: 'preparing', progress: 0 });
        
        // Check for cancellation
        if (this.cancelFlags.get(id)) throw new Error('Task cancelled');

        const response = await fetch(item.sourceUrl);
        if (!response.ok) {
          throw new Error(`Failed to download remote file: ${response.statusText}`);
        }
        inputData = await response.blob();
      }

      if (!inputData) {
        await db.cart.update(id, {
          status: 'source_required',
          errorMessage: 'Source file required before processing. Attach a local audio/video file.',
        });
        return;
      }

      // Check for cancellation
      if (this.cancelFlags.get(id)) throw new Error('Task cancelled');

      // 2. Perform transcoding using WasmMediaProcessor
      await db.cart.update(id, { status: 'processing', progress: 0 });

      // Run FFmpeg conversion
      const processedBlob = await mediaProcessor.convert(
        inputData,
        item.outputFormat,
        item.quality,
        async (progress) => {
          if (!this.cancelFlags.get(id)) {
            await db.cart.update(id, { progress });
          }
        },
        id
      );

      // Check for cancellation
      if (this.cancelFlags.get(id)) throw new Error('Task cancelled');

      // 3. Metadata Tagging (Phase 4 integration)
      await db.cart.update(id, { status: 'tagging', progress: 95 });
      
      let taggedBlob = processedBlob;
      try {
        // Write metadata if output format is MP3
        if (item.outputFormat === 'mp3') {
          taggedBlob = await writeMetadata(id, processedBlob, item);
        }
      } catch (metaErr) {
        console.warn('Metadata tagging failed, using untagged file:', metaErr);
      }

      // Save processed blob in memory
      mediaRegistry.registerProcessedBlob(id, taggedBlob);

      // Mark as completed
      await db.cart.update(id, { status: 'ready', progress: 100 });

      // Save to history audit log
      await db.history.put({
        id: `hist_${id}_${Date.now()}`,
        title: item.title,
        artist: item.artist,
        artistNormalized: item.artistNormalized || item.artist.toLowerCase().trim().replace(/\s+/g, ' '),
        source: item.source,
        format: item.outputFormat,
        quality: item.quality,
        processedAt: Date.now(),
        status: 'success'
      });

    } catch (error: any) {
      if (this.cancelFlags.get(id)) {
        await db.cart.update(id, { status: 'cancelled', progress: 0 });
      } else {
        console.error(`Error processing item ${id}:`, error);
        await db.cart.update(id, {
          status: 'failed',
          errorMessage: error?.message || 'Unknown processing error'
        });

        await db.history.put({
          id: `hist_${id}_${Date.now()}`,
          title: item.title,
          artist: item.artist,
          artistNormalized: item.artistNormalized || item.artist.toLowerCase().trim().replace(/\s+/g, ' '),
          source: item.source,
          format: item.outputFormat,
          quality: item.quality,
          processedAt: Date.now(),
          status: 'failed',
          errorMessage: error?.message || 'Processing error'
        });
      }
    }
  }

  /**
   * Process next items in the queue up to concurrency limit.
   */
  private async processNext() {
    if (!this.running) return;

    // Get current concurrency settings
    const settings = await db.settings.get('current');
    const concurrencyLimit = settings?.concurrencyLimit || 2;

    if (this.activeCount >= concurrencyLimit) return;

    // Fetch next pending item (ordered by addedAt)
    let pendingItems = await db.cart
      .where('status')
      .anyOf('pending', 'failed')
      .sortBy('addedAt');

    // Filter by active scope if scoped processing was requested
    if (this.activeScopeIds) {
      pendingItems = pendingItems.filter(item => this.activeScopeIds!.has(item.id));
    }

    // Filter to only items that can actually be processed (have media source)
    pendingItems = pendingItems.filter(item => this.canProcess(item));

    if (pendingItems.length === 0) {
      if (this.activeCount === 0) {
        this.running = false; // Queue fully finished
        this.activeScopeIds = null; // Clear scope
      }
      return;
    }

    const item = pendingItems[0];
    
    // Lock item by updating status immediately to avoid racing
    await db.cart.update(item.id, { status: 'preparing', progress: 0 });

    this.activeCount++;
    
    // Trigger next concurrent items
    this.processNext();

    // Process the item asynchronously
    await this.processItem(item);
    
    this.activeCount--;
    
    // Trigger loop continuation
    this.processNext();
  }

  /**
   * Cancels a single item processing task.
   */
  async cancelTask(id: string) {
    this.cancelFlags.set(id, true);
    await mediaProcessor.cancel(id);
    await db.cart.update(id, { status: 'cancelled', progress: 0 });
  }

  /**
   * Cancels items in the processing queue.
   * If an active scope is set, cancels only items in that scope.
   */
  async cancelAll() {
    const scopeToCancel = this.activeScopeIds;
    this.stopProcessing();
    this.activeScopeIds = null;

    const activeAndPending = await db.cart.toArray();
    for (const item of activeAndPending) {
      // If scope was active, only cancel items belonging to that scope
      if (scopeToCancel && !scopeToCancel.has(item.id)) {
        continue;
      }

      if (['preparing', 'processing', 'tagging', 'pending'].includes(item.status)) {
        await this.cancelTask(item.id);
      }
    }
  }
}

export const queueProcessor = new QueueProcessor();
