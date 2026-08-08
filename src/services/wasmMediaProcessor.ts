import { MediaProcessor } from './mediaProcessor';

/**
 * WasmMediaProcessor
 *
 * Client-side implementation of MediaProcessor powered by ffmpeg.wasm.
 * Simulates conversion tasks during UI mock phases and executes actual
 * WebAssembly transcoders in later phases.
 */
export class WasmMediaProcessor implements MediaProcessor {
  private initialized = false;
  private activeTasks = new Map<string, boolean>();

  async initialize(): Promise<void> {
    // Simulate loading libraries
    await new Promise((resolve) => setTimeout(resolve, 800));
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized;
  }

  async convert(
    inputFile: File | Blob,
    outputFormat: 'mp3' | 'wav' | 'flac' | 'm4a' | 'mp4',
    qualityBitrate: '128' | '192' | '256' | '320',
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (!this.initialized) {
      throw new Error('Media processor is not initialized. Call initialize() first.');
    }

    const taskId = Math.random().toString(36).substring(7);
    this.activeTasks.set(taskId, true);

    return new Promise((resolve, reject) => {
      let progress = 0;
      const interval = setInterval(() => {
        // Check if task was cancelled
        if (!this.activeTasks.get(taskId)) {
          clearInterval(interval);
          reject(new Error('Conversion task was cancelled.'));
          return;
        }

        progress += 10;
        if (onProgress) {
          onProgress(Math.min(progress, 100));
        }

        if (progress >= 100) {
          clearInterval(interval);
          this.activeTasks.delete(taskId);
          
          // Return input data wrapped in mock extension type
          const mockType = outputFormat === 'mp3' ? 'audio/mpeg' : `audio/${outputFormat}`;
          resolve(new Blob([inputFile], { type: mockType }));
        }
      }, 150);
    });
  }

  async cancel(taskId: string): Promise<void> {
    this.activeTasks.set(taskId, false);
  }

  async dispose(): Promise<void> {
    this.activeTasks.clear();
    this.initialized = false;
  }
}

export const mediaProcessor = new WasmMediaProcessor();
