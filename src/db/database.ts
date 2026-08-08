import Dexie, { type Table } from 'dexie';

export type AudioResolutionStatus =
  | 'idle'
  | 'resolving'
  | 'resolved'
  | 'ambiguous'
  | 'unavailable'
  | 'failed';

export type ProcessingStatus =
  | 'pending'
  | 'downloading'
  | 'preparing'
  | 'converting'
  | 'tagging'
  | 'ready'
  | 'failed'
  | 'cancelled';

export interface ResolvedMediaInfo {
  provider: string;
  providerItemId?: string;
  mediaUrl: string;
  confidence: number;
  matchedTitle?: string;
  matchedArtist?: string;
  matchedDuration?: number;
  license?: {
    name?: string;
    url?: string;
    verified: boolean;
  };
  resolvedAt: number;
  mediaUrlExpiresAt?: number;
}

export interface CartItem {
  id: string; // Unique ID (e.g. YouTube video ID or random UUID)
  source: 'youtube' | 'local' | 'direct';
  sourceId?: string;
  sourceUrl?: string;
  title: string;
  artist: string;
  artistNormalized: string; // Lowercased, trimmed — for grouping/filtering
  album?: string;
  year?: string;
  genre?: string;
  trackNumber?: string;
  thumbnailUrl?: string;
  duration: number; // in seconds
  addedAt: number;
  outputFormat: 'mp3' | 'mp4' | 'wav' | 'flac' | 'm4a';
  quality: '128' | '192' | '256' | '320';
  
  // High-level processing status
  status: 'pending' | 'preparing' | 'processing' | 'tagging' | 'ready' | 'failed' | 'cancelled' | 'source_required';
  
  // Separated lifecycle state fields
  audioResolutionStatus?: AudioResolutionStatus;
  processingStatus?: ProcessingStatus;
  resolvedMedia?: ResolvedMediaInfo;
  userReviewedMatch?: boolean;

  allowProcessing?: boolean;
  progress?: number;
  errorMessage?: string;
  fileSizeEstimate?: number; // estimated size in bytes
}

export interface AudioResolutionEntry {
  youtubeId: string;
  provider: string;
  providerItemId?: string;
  mediaUrl: string;
  confidence: number;
  matchedTitle?: string;
  matchedArtist?: string;
  matchedDuration?: number;
  license?: {
    name?: string;
    url?: string;
    verified: boolean;
  };
  resolvedAt: number;
  mediaUrlExpiresAt?: number;
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  itemIds: string[]; // Reference to CartItem IDs
}

export interface HistoryEntry {
  id: string;
  title: string;
  artist: string;
  artistNormalized: string; // For filtering
  source: 'youtube' | 'local' | 'direct';
  format: 'mp3' | 'mp4' | 'wav' | 'flac' | 'm4a';
  quality: '128' | '192' | '256' | '320';
  processedAt: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}

export interface AppSettings {
  id: string; // Always 'current'
  youtubeApiKey?: string;
  defaultOutputFormat: 'mp3' | 'mp4' | 'wav' | 'flac' | 'm4a';
  defaultQuality: '128' | '192' | '256' | '320';
  defaultExportPreset: 'universal' | 'car' | 'dj' | 'hq' | 'small' | 'custom';
  defaultFolderStructure: 'flat' | 'artist' | 'album' | 'genre' | 'playlist';
  concurrencyLimit: number;
  autoProcessOnResolved?: boolean;
}

export class MPMusicWebDatabase extends Dexie {
  cart!: Table<CartItem, string>;
  playlists!: Table<Playlist, string>;
  history!: Table<HistoryEntry, string>;
  settings!: Table<AppSettings, string>;
  audioResolutions!: Table<AudioResolutionEntry, string>;

  constructor() {
    super('MPMusicWebDB');

    // v1 — original schema
    this.version(1).stores({
      cart: 'id, source, title, artist, status, addedAt',
      playlists: 'id, name, createdAt',
      history: 'id, title, artist, processedAt, status',
      settings: 'id'
    });

    // v2 — add artistNormalized index on cart and history; add genre index on cart
    this.version(2)
      .stores({
        cart: 'id, source, title, artist, artistNormalized, status, addedAt, genre',
        playlists: 'id, name, createdAt',
        history: 'id, title, artist, artistNormalized, processedAt, status',
        settings: 'id'
      })
      .upgrade(async (trans) => {
        await trans
          .table('cart')
          .toCollection()
          .modify((item: CartItem) => {
            if (!item.artistNormalized) {
              item.artistNormalized = (item.artist || '').toLowerCase().trim().replace(/\s+/g, ' ');
            }
          });

        await trans
          .table('history')
          .toCollection()
          .modify((entry: HistoryEntry) => {
            if (!entry.artistNormalized) {
              entry.artistNormalized = (entry.artist || '').toLowerCase().trim().replace(/\s+/g, ' ');
            }
          });
      });

    // v3 — add audioResolutions cache table and resolution index
    this.version(3)
      .stores({
        cart: 'id, source, title, artist, artistNormalized, status, audioResolutionStatus, addedAt, genre',
        playlists: 'id, name, createdAt',
        history: 'id, title, artist, artistNormalized, processedAt, status',
        settings: 'id',
        audioResolutions: 'youtubeId, provider, resolvedAt, confidence'
      })
      .upgrade(async (trans) => {
        await trans
          .table('cart')
          .toCollection()
          .modify((item: CartItem) => {
            if (!item.audioResolutionStatus) {
              item.audioResolutionStatus = item.source === 'local' || item.source === 'direct' ? 'resolved' : 'idle';
            }
          });
      });
  }
}

export const db = new MPMusicWebDatabase();

// Helper to initialize default settings
export async function initializeSettings() {
  const currentSettings = await db.settings.get('current');
  if (!currentSettings) {
    await db.settings.put({
      id: 'current',
      youtubeApiKey: '',
      defaultOutputFormat: 'mp3',
      defaultQuality: '320',
      defaultExportPreset: 'universal',
      defaultFolderStructure: 'flat',
      concurrencyLimit: 2,
      autoProcessOnResolved: false
    });
  }
}
