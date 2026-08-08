import { db } from '../../db/database';
import type { CartItem, AudioResolutionEntry, AudioResolutionStatus } from '../../db/database';
import type { AudioProvider, AudioQuery, AudioResolutionResult, CandidateTrack } from './types';
import { CuratedProvider } from './providers/curatedProvider';
import { ArchiveOrgProvider } from './providers/archiveOrgProvider';
import { scoreCandidate } from './matching/scorer';

export class AudioResolver {
  private providers: AudioProvider[];

  constructor(customProviders?: AudioProvider[]) {
    this.providers = customProviders || [
      new CuratedProvider(),
      new ArchiveOrgProvider(),
    ];
  }

  /**
   * Resolves authorized audio for a YouTube track.
   * Checks IndexedDB cache first, then cascades through providers.
   */
  async resolve(query: AudioQuery): Promise<AudioResolutionResult> {
    const now = Date.now();

    // 1. Check local cache
    try {
      const cached = await db.audioResolutions.get(query.youtubeId);
      if (cached) {
        const isExpired = cached.mediaUrlExpiresAt && cached.mediaUrlExpiresAt < now;
        if (!isExpired) {
          const status =
            cached.confidence >= 0.92
              ? 'resolved'
              : cached.confidence >= 0.80
              ? 'ambiguous'
              : 'unavailable';

          return {
            status,
            mediaUrl: cached.mediaUrl,
            provider: cached.provider,
            providerItemId: cached.providerItemId,
            confidence: cached.confidence,
            matchedTitle: cached.matchedTitle,
            matchedArtist: cached.matchedArtist,
            matchedDuration: cached.matchedDuration,
            license: cached.license,
            mediaUrlExpiresAt: cached.mediaUrlExpiresAt,
            resolvedAt: cached.resolvedAt,
          };
        }
      }
    } catch {
      // IndexedDB cache error fallback — continue to live search
    }

    // 2. Query all providers in parallel
    const settledResults = await Promise.allSettled(
      this.providers.map((provider) => provider.search(query))
    );

    const candidates: CandidateTrack[] = [];
    for (const res of settledResults) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        candidates.push(...res.value);
      }
    }

    if (candidates.length === 0) {
      const unavailableResult: AudioResolutionResult = {
        status: 'unavailable',
        confidence: 0,
        resolvedAt: now,
      };

      // Cache the negative result to avoid repeating queries immediately
      await this.cacheResolution({
        youtubeId: query.youtubeId,
        provider: 'none',
        mediaUrl: '',
        confidence: 0,
        resolvedAt: now,
      });

      return unavailableResult;
    }

    // 3. Score all candidates
    const scoredCandidates = candidates.map((candidate) => {
      const score = scoreCandidate(query, candidate);
      return {
        candidate,
        score,
      };
    });

    // Sort by composite confidence descending
    scoredCandidates.sort((a, b) => b.score.compositeConfidence - a.score.compositeConfidence);

    const best = scoredCandidates[0];

    let finalStatus: AudioResolutionResult['status'] = 'unavailable';
    if (best.score.compositeConfidence >= 0.92) {
      finalStatus = 'resolved';
    } else if (best.score.compositeConfidence >= 0.80) {
      finalStatus = 'ambiguous';
    }

    const resolutionResult: AudioResolutionResult = {
      status: finalStatus,
      mediaUrl: best.candidate.mediaUrl,
      provider: best.candidate.provider,
      providerItemId: best.candidate.providerItemId,
      confidence: best.score.compositeConfidence,
      matchedTitle: best.candidate.title,
      matchedArtist: best.candidate.artist,
      matchedDuration: best.candidate.duration,
      license: best.candidate.license,
      mediaUrlExpiresAt: best.candidate.mediaUrlExpiresAt,
      scoreDetails: best.score,
      resolvedAt: now,
    };

    // 4. Save to IndexedDB resolution cache
    await this.cacheResolution({
      youtubeId: query.youtubeId,
      provider: best.candidate.provider,
      providerItemId: best.candidate.providerItemId,
      mediaUrl: best.candidate.mediaUrl,
      confidence: best.score.compositeConfidence,
      matchedTitle: best.candidate.title,
      matchedArtist: best.candidate.artist,
      matchedDuration: best.candidate.duration,
      license: best.candidate.license,
      resolvedAt: now,
      mediaUrlExpiresAt: best.candidate.mediaUrlExpiresAt,
    });

    return resolutionResult;
  }

  /**
   * Helper to resolve audio for a CartItem and update Dexie cart table
   */
  async resolveCartItem(item: CartItem): Promise<AudioResolutionResult> {
    if (item.source === 'local') {
      return {
        status: 'resolved',
        confidence: 1.0,
        provider: 'local_file',
        resolvedAt: Date.now(),
      };
    }

    // Set cart item status to resolving
    await db.cart.update(item.id, {
      audioResolutionStatus: 'resolving',
    });

    const query: AudioQuery = {
      youtubeId: item.sourceId || item.id,
      title: item.title,
      artist: item.artist,
      duration: item.duration,
      album: item.album,
    };

    try {
      const result = await this.resolve(query);
      const audioResolutionStatus: AudioResolutionStatus =
        result.status === 'error' ? 'failed' : result.status;

      await db.cart.update(item.id, {
        audioResolutionStatus,
        allowProcessing: result.status === 'resolved',
        status: result.status === 'resolved' ? 'pending' : 'source_required',
        resolvedMedia:
          result.status !== 'unavailable'
            ? {
                provider: result.provider || 'unknown',
                providerItemId: result.providerItemId,
                mediaUrl: result.mediaUrl || '',
                confidence: result.confidence,
                matchedTitle: result.matchedTitle,
                matchedArtist: result.matchedArtist,
                matchedDuration: result.matchedDuration,
                license: result.license,
                resolvedAt: result.resolvedAt,
                mediaUrlExpiresAt: result.mediaUrlExpiresAt,
              }
            : undefined,
      });

      return result;
    } catch (err: any) {
      await db.cart.update(item.id, {
        audioResolutionStatus: 'failed',
        allowProcessing: false,
        errorMessage: err.message || 'Resolution failed',
      });

      return {
        status: 'error',
        confidence: 0,
        errorMessage: err.message,
        resolvedAt: Date.now(),
      };
    }
  }

  private async cacheResolution(entry: AudioResolutionEntry) {
    try {
      await db.audioResolutions.put(entry);
    } catch {
      // Ignore cache storage error
    }
  }
}

export const audioResolver = new AudioResolver();
