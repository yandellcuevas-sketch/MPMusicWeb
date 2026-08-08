import { db } from '../db/database';
import type { CartItem } from '../db/database';
import { mediaRegistry } from './mediaAssetRegistry';
import { mediaProcessor } from './wasmMediaProcessor';
import { writeMetadata } from './metadataService'; // Placeholder for Phase 4

export class QueueProcessor {
  private activeCount = 0;
  private running = false;
  private cancelFlags = new Map<string, boolean>();

  /**
   * Starts processing the cart queue.
   */
  async startProcessing() {
    if (this.running) return;
    this.running = true;

    // Initialize media processor first
    await mediaProcessor.initialize().catch((err) => {
      console.error('Failed to initialize media processor:', err);
    });

    this.processNext();
  }

  /**
   * Stops the queue processor. Active tasks will continue but no new tasks start.
   */
  stopProcessing() {
    this.running = false;
  }

  /**
   * Process individual item.
   */
  async processItem(item: CartItem) {
    const id = item.id;
    this.cancelFlags.set(id, false);

    try {
      // 1. Fetch direct URL file or load from memory registry
      let inputData: File | Blob | null = null;

      if (item.source === 'local') {
        inputData = mediaRegistry.getLocalFile(id) || null;
        if (!inputData) {
          throw new Error('Local file source not found in memory. Please re-import.');
        }
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
        throw new Error('No input data available to process.');
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
        }
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
    const pendingItems = await db.cart
      .where('status')
      .anyOf('pending', 'failed')
      .sortBy('addedAt');

    if (pendingItems.length === 0) {
      if (this.activeCount === 0) {
        this.running = false; // Queue fully finished
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
   * Cancels all items in the processing queue.
   */
  async cancelAll() {
    this.stopProcessing();
    const activeAndPending = await db.cart.toArray();
    for (const item of activeAndPending) {
      if (['preparing', 'processing', 'tagging', 'pending'].includes(item.status)) {
        await this.cancelTask(item.id);
      }
    }
  }
}

export const queueProcessor = new QueueProcessor();
