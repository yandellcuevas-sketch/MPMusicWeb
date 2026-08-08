import { CartItem } from '../db/database';
import { mediaRegistry } from './mediaAssetRegistry';

/**
 * Sanitizes input text to be safe for Windows and FAT32 filenames.
 * Replaces: \ / : * ? " < > | with underscores and trims whitespace.
 */
export function sanitizeFilename(name: string): string {
  if (!name) return 'Unknown';
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes text to avoid issues with older car stereos.
 * Removes accents and uses simple ASCII characters.
 */
export function normalizeForCarStereo(text: string): string {
  return sanitizeFilename(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Retain only basic alphanumeric, spaces, dash, underscore
    .substring(0, 50); // limit length to avoid deep paths
}

export interface ExportProgress {
  totalCount: number;
  currentCount: number;
  currentName: string;
  progressPercentage: number;
  speedMbps: number; // MB per second
  completed: boolean;
  errorCount: number;
}

export class UsbService {
  /**
   * Helper to traverse and get or create a nested subfolder structure on a Directory Handle.
   */
  async getOrCreateDirectory(
    rootHandle: FileSystemDirectoryHandle,
    pathParts: string[]
  ): Promise<FileSystemDirectoryHandle> {
    let currentHandle = rootHandle;
    for (const part of pathParts) {
      const cleanPart = sanitizeFilename(part);
      if (cleanPart) {
        currentHandle = await currentHandle.getDirectoryHandle(cleanPart, { create: true });
      }
    }
    return currentHandle;
  }

  /**
   * Exports processed tracks directly to a folder selected by the user.
   */
  async exportToFolder(
    items: CartItem[],
    dirHandle: FileSystemDirectoryHandle,
    options: {
      structure: 'flat' | 'artist' | 'album' | 'genre';
      preset: 'universal' | 'car' | 'dj' | 'hq' | 'small' | 'custom';
    },
    onProgress?: (progress: ExportProgress) => void
  ): Promise<void> {
    const totalCount = items.length;
    let currentCount = 0;
    let errorCount = 0;
    let startTime = Date.now();
    let totalBytesWritten = 0;

    const reportProgress = (currentName: string, bytesJustWritten: number = 0) => {
      totalBytesWritten += bytesJustWritten;
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const speedMbps = elapsedSeconds > 0 ? (totalBytesWritten / 1024 / 1024) / elapsedSeconds : 0;
      
      if (onProgress) {
        onProgress({
          totalCount,
          currentCount,
          currentName,
          progressPercentage: Math.round((currentCount / totalCount) * 100),
          speedMbps: Math.round(speedMbps * 10) / 10,
          completed: currentCount === totalCount,
          errorCount
        });
      }
    };

    for (const item of items) {
      const blob = mediaRegistry.getProcessedBlob(item.id);
      if (!blob) {
        console.warn(`No processed binary found for item: ${item.title}`);
        errorCount++;
        currentCount++;
        reportProgress(item.title);
        continue;
      }

      try {
        // 1. Establish target path parts based on selected structure
        const pathParts: string[] = [];
        if (options.structure === 'artist' && item.artist) {
          pathParts.push(item.artist);
        } else if (options.structure === 'album' && item.album) {
          pathParts.push(item.artist || 'Unknown Artist', item.album);
        } else if (options.structure === 'genre' && item.genre) {
          pathParts.push(item.genre);
        }

        const targetFolderHandle =
          pathParts.length > 0 ? await this.getOrCreateDirectory(dirHandle, pathParts) : dirHandle;

        // 2. Format final filename based on preset options
        let filename = '';
        if (options.preset === 'car') {
          // Car Stereo: normalized basic ASCII, shorter names
          const artistPart = normalizeForCarStereo(item.artist || 'Artist');
          const titlePart = normalizeForCarStereo(item.title);
          filename = `${artistPart} - ${titlePart}.${item.outputFormat}`;
        } else {
          // Standard sanitization
          filename = `${sanitizeFilename(item.artist || 'Artist')} - ${sanitizeFilename(
            item.title
          )}.${item.outputFormat}`;
        }

        // 3. Write binary to USB directory handle
        const fileHandle = await targetFolderHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        currentCount++;
        reportProgress(filename, blob.size);
      } catch (err) {
        console.error(`Failed to write file ${item.title} to folder:`, err);
        errorCount++;
        currentCount++;
        reportProgress(item.title);
      }
    }

    // Final completed report
    if (onProgress) {
      onProgress({
        totalCount,
        currentCount: totalCount,
        currentName: 'Export completed!',
        progressPercentage: 100,
        speedMbps: 0,
        completed: true,
        errorCount
      });
    }
  }

  /**
   * Triggers a fallback zip bundle download using the browser dynamic anchor trigger.
   */
  async exportAsZipFallback(items: CartItem[]): Promise<Blob> {
    // Note: We avoid embedding huge multi-MB compression scripts (like JSZip)
    // in RAM directly without limit. In modern PWA apps, we can construct
    // a basic ZIP structure or download files sequentially.
    // Here we will mock/provide a simple Blob concat for demo or import a light helper.
    // To stay reliable and local-first, we warn the user in the UI, and if they request
    // download fallback, we can let them download individual files sequentially or
    // package them. Downloading files sequentially (by creating a dynamic <a> link and clicking it for each file)
    // is the most reliable, memory-efficient way to handle mult-GB exports in unsupported browsers
    // because it completely bypasses RAM compression limitations!
    
    // We will provide a download trigger in the UI that triggers downloads one-by-one.
    return new Blob(['Sequential triggers preferred to save RAM'], { type: 'text/plain' });
  }
}

export const usbService = new UsbService();
