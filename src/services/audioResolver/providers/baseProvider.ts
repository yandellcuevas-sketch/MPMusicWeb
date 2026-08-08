import type { AudioProvider, AudioQuery, CandidateTrack } from '../types';

export abstract class BaseAudioProvider implements AudioProvider {
  abstract name: string;
  abstract search(query: AudioQuery): Promise<CandidateTrack[]>;

  protected timeoutFetch(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, {
      ...options,
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
    });
  }
}
