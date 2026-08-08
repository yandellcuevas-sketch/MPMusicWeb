import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import type { MediaProcessor } from './mediaProcessor';

/**
 * WasmMediaProcessor
 *
 * Implements MediaProcessor using client-side FFmpeg.wasm.
 * Spawns isolated, task-specific FFmpeg workers to support real concurrent runs
 * and true worker thread cancellation.
 */
export class WasmMediaProcessor implements MediaProcessor {
  private activeInstances = new Map<string, FFmpeg>();
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized;
  }

  async convert(
    inputFile: File | Blob,
    outputFormat: 'mp3' | 'wav' | 'flac' | 'm4a' | 'mp4',
    qualityBitrate: '128' | '192' | '256' | '320',
    onProgress?: (progress: number) => void,
    taskId?: string
  ): Promise<Blob> {
    if (!this.initialized) {
      throw new Error('Media processor is not initialized.');
    }

    const activeTaskId = taskId || Math.random().toString(36).substring(7);
    
    // Instantiate a new, isolated FFmpeg instance for this specific conversion task
    const ffmpeg = new FFmpeg();
    this.activeInstances.set(activeTaskId, ffmpeg);

    // Get input and output filenames
    const inputExt = inputFile instanceof File ? inputFile.name.split('.').pop() || 'mp4' : 'mp4';
    const inputName = `input_${activeTaskId}.${inputExt}`;
    const outputName = `output_${activeTaskId}.${outputFormat}`;

    try {
      // Determine the base URL for the FFmpeg core files.
      // import.meta.env.BASE_URL is '/' in dev and '/MPMusicWeb/' on Pages.
      // We strip any trailing slash before appending the subdirectory.
      const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
      const base = `${window.location.origin}${baseUrl}/ffmpeg`;

      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      });


      // Write source file to FFmpeg Virtual File System (MEMFS)
      const fileData = await fetchFile(inputFile);
      await ffmpeg.writeFile(inputName, fileData);

      // Register real progress event listener
      ffmpeg.on('progress', ({ progress }) => {
        if (onProgress) {
          onProgress(Math.round(progress * 100));
        }
      });

      // Prepare command arguments
      const args: string[] = ['-i', inputName];

      if (outputFormat === 'mp3') {
        // Extract audio, set sampling rate, channels and bitrate
        args.push('-vn', '-ar', '44100', '-ac', '2', '-b:a', `${qualityBitrate}k`, outputName);
      } else if (outputFormat === 'm4a') {
        args.push('-vn', '-c:a', 'aac', '-b:a', `${qualityBitrate}k`, outputName);
      } else if (outputFormat === 'wav') {
        args.push('-vn', '-acodec', 'pcm_s16le', outputName);
      } else if (outputFormat === 'flac') {
        args.push('-vn', '-acodec', 'flac', outputName);
      } else if (outputFormat === 'mp4') {
        args.push('-c', 'copy', outputName);
      }

      // Execute conversion in WASM
      await ffmpeg.exec(args);

      // Read output file from virtual filesystem
      const outputData = await ffmpeg.readFile(outputName);
      const mimeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        flac: 'audio/flac',
        m4a: 'audio/mp4',
        mp4: 'video/mp4',
      };

      const resultBlob = new Blob([outputData], { type: mimeMap[outputFormat] });

      // Clean up Virtual File System files
      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});
      
      // Terminate instance to release WASM memory
      ffmpeg.terminate();
      this.activeInstances.delete(activeTaskId);

      return resultBlob;
    } catch (error) {
      // Release workers on error
      ffmpeg.terminate();
      this.activeInstances.delete(activeTaskId);
      throw error;
    }
  }

  async cancel(taskId: string): Promise<void> {
    const ffmpeg = this.activeInstances.get(taskId);
    if (ffmpeg) {
      try {
        // Terminating the instance immediately aborts the active WASM thread
        ffmpeg.terminate();
      } catch (err) {
        console.error('Error terminating FFmpeg worker:', err);
      }
      this.activeInstances.delete(taskId);
    }
  }

  async dispose(): Promise<void> {
    for (const [taskId, ffmpeg] of this.activeInstances.entries()) {
      try {
        ffmpeg.terminate();
      } catch (err) {}
      this.activeInstances.delete(taskId);
    }
    this.initialized = false;
  }
}

export const mediaProcessor = new WasmMediaProcessor();
