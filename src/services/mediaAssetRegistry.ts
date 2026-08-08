/**
 * MediaAssetRegistry
 *
 * Manages in-memory references to large media files (Files from local drag & drop,
 * and processed Blobs ready for USB export). Keeps heavy binaries out of IndexedDB.
 */
class MediaAssetRegistry {
  private localFiles = new Map<string, File>();
  private processedBlobs = new Map<string, Blob>();

  /**
   * Register a raw file imported locally by the user.
   */
  registerLocalFile(id: string, file: File) {
    this.localFiles.set(id, file);
  }

  /**
   * Retrieve an imported local file.
   */
  getLocalFile(id: string): File | undefined {
    return this.localFiles.get(id);
  }

  /**
   * Check if a local file is registered in memory.
   */
  hasLocalFile(id: string): boolean {
    return this.localFiles.has(id);
  }

  /**
   * Remove local file reference.
   */
  removeLocalFile(id: string) {
    this.localFiles.delete(id);
  }

  /**
   * Register a processed audio/video binary blob (e.g. converted to MP3).
   */
  registerProcessedBlob(id: string, blob: Blob) {
    this.processedBlobs.set(id, blob);
  }

  /**
   * Retrieve a processed binary blob.
   */
  getProcessedBlob(id: string): Blob | undefined {
    return this.processedBlobs.get(id);
  }

  /**
   * Remove a processed blob reference.
   */
  removeProcessedBlob(id: string) {
    this.processedBlobs.delete(id);
  }

  /**
   * Clear all transient memory storage.
   */
  clear() {
    this.localFiles.clear();
    this.processedBlobs.clear();
  }
}

export const mediaRegistry = new MediaAssetRegistry();
