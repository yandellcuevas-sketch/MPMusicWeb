export interface AudioQuery {
  youtubeId: string;
  title: string;
  artist: string;
  duration: number; // in seconds
  album?: string;
}

export interface CandidateTrack {
  provider: string;
  providerItemId: string;
  title: string;
  artist: string;
  duration?: number; // in seconds
  mediaUrl: string;
  mediaFormat?: string;
  mediaSize?: number;
  license?: {
    name?: string;
    url?: string;
    verified: boolean;
  };
  mediaUrlExpiresAt?: number;
}

export interface ResolutionScore {
  titleSimilarity: number;
  artistSimilarity: number;
  durationScore: number;
  penaltyScore: number;
  compositeConfidence: number;
  status: 'resolved' | 'ambiguous' | 'unavailable';
  details: string[];
}

export interface AudioResolutionResult {
  status: 'resolved' | 'ambiguous' | 'unavailable' | 'error';
  mediaUrl?: string;
  provider?: string;
  providerItemId?: string;
  confidence: number;
  matchedTitle?: string;
  matchedArtist?: string;
  matchedDuration?: number;
  license?: {
    name?: string;
    url?: string;
    verified: boolean;
  };
  mediaUrlExpiresAt?: number;
  scoreDetails?: ResolutionScore;
  resolvedAt: number;
  errorMessage?: string;
}

export interface AudioProvider {
  name: string;
  search(query: AudioQuery): Promise<CandidateTrack[]>;
}
