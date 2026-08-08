/**
 * MediaProcessor Interface
 *
 * Abstract representation of a media processing engine.
 * Allows switching between ffmpeg.wasm and other (native or server-side) runtimes.
 */
export interface MediaProcessor {
  /**
   * Initialize resources (e.g. download wasm, spin up workers).
   */
  initialize(): Promise<void>;

  /**
   * Check if the processor is loaded and ready.
   */
  isReady(): boolean;

  /**
   * Concurrently convert a media file to the target format.
   *
   * @param inputFile The input audio/video file.
   * @param outputFormat The requested format extensions.
   * @param qualityBitrate The output bitrate (e.g., '128', '192', '256', '320').
   * @param onProgress Callbacks to report progress percentages (0-100).
   * @returns A promise that resolves to the processed Blob.
   */
  convert(
    inputFile: File | Blob,
    outputFormat: 'mp3' | 'wav' | 'flac' | 'm4a' | 'mp4',
    qualityBitrate: '128' | '192' | '256' | '320',
    onProgress?: (progress: number) => void
  ): Promise<Blob>;

  /**
   * Cancel an active conversion task.
   */
  cancel(taskId: string): Promise<void>;

  /**
   * Clean up background workers or memory.
   */
  dispose(): Promise<void>;
}
