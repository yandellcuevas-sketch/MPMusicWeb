import type { CartItem } from '../db/database';
import { mediaRegistry } from './mediaAssetRegistry';
import { sanitizeFilename } from './usbService';

/**
 * SequentialDownloadService
 *
 * Real browser-native fallback for Safari, Firefox, and any browser lacking
 * the File System Access API (showDirectoryPicker).
 *
 * Strategy: iterate over ready items, create a temporary Object URL for each
 * Blob, programmatically click an <a download> anchor, then immediately
 * revoke the URL. A small inter-file delay prevents browser download throttling.
 *
 * Does NOT load all blobs into extra memory — each ObjectURL is created and
 * revoked per file.
 */

export interface SequentialDownloadProgress {
  /** Total files to download (only those with a processedBlob). */
  totalCount: number;
  /** Files downloaded so far. */
  currentCount: number;
  /** Filename currently being downloaded. */
  currentName: string;
  progressPercentage: number;
  /** Files skipped because no processedBlob was found. */
  skippedCount: number;
  /** Files that failed due to an error during anchor click / URL creation. */
  errorCount: number;
  completed: boolean;
}

export interface SequentialDownloadOptions {
  /** Milliseconds to wait between individual file downloads. Default: 700ms */
  intervalMs?: number;
  /** Optional cancellation signal. Set to true to stop mid-sequence. */
  cancelRef?: { cancelled: boolean };
  onProgress?: (progress: SequentialDownloadProgress) => void;
}

/**
 * Triggers sequential browser downloads for a list of cart items.
 * Only items with a processedBlob in mediaRegistry are downloaded.
 * Items without a blob are counted as skipped (not errors).
 *
 * @param items - Cart items to download (should already be filtered to 'ready').
 * @param options - Configuration (interval, cancel ref, progress callback).
 * @returns A summary of the download run.
 */
export async function downloadSequentially(
  items: CartItem[],
  options: SequentialDownloadOptions = {}
): Promise<SequentialDownloadProgress> {
  const { intervalMs = 700, cancelRef, onProgress } = options;

  const eligibleItems = items.filter((item) => mediaRegistry.getProcessedBlob(item.id) !== undefined);
  const totalCount = eligibleItems.length;
  let currentCount = 0;
  let skippedCount = items.length - totalCount; // items without blob
  let errorCount = 0;

  const report = (currentName: string): SequentialDownloadProgress => ({
    totalCount,
    currentCount,
    currentName,
    progressPercentage: totalCount > 0 ? Math.round((currentCount / totalCount) * 100) : 100,
    skippedCount,
    errorCount,
    completed: currentCount >= totalCount,
  });

  if (totalCount === 0) {
    const final = report('No files ready');
    onProgress?.(final);
    return final;
  }

  onProgress?.(report('Starting downloads…'));

  for (const item of eligibleItems) {
    // Check cancellation before each file
    if (cancelRef?.cancelled) break;

    const blob = mediaRegistry.getProcessedBlob(item.id);
    if (!blob) {
      // Shouldn't happen since we filtered above, but guard it
      skippedCount++;
      continue;
    }

    const filename = `${sanitizeFilename(item.artist || 'Artist')} - ${sanitizeFilename(item.title)}.${item.outputFormat}`;

    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err) {
      console.error(`Failed to trigger download for "${filename}":`, err);
      errorCount++;
    } finally {
      // Always revoke the ObjectURL to free browser memory
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }

    currentCount++;
    onProgress?.(report(filename));

    // Inter-file delay — prevents browser from throttling or merging downloads
    if (currentCount < totalCount && !cancelRef?.cancelled) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const final: SequentialDownloadProgress = {
    totalCount,
    currentCount,
    currentName: cancelRef?.cancelled ? 'Downloads cancelled.' : 'All downloads complete!',
    progressPercentage: totalCount > 0 ? Math.round((currentCount / totalCount) * 100) : 100,
    skippedCount,
    errorCount,
    completed: true,
  };

  onProgress?.(final);
  return final;
}
