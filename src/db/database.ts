import Dexie, { type Table } from 'dexie';

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
  status: 'pending' | 'preparing' | 'processing' | 'tagging' | 'ready' | 'failed' | 'cancelled' | 'source_required';
  allowProcessing?: boolean;
  progress?: number;
  errorMessage?: string;
  fileSizeEstimate?: number; // estimated size in bytes
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
}

export class MPMusicWebDatabase extends Dexie {
  cart!: Table<CartItem, string>;
  playlists!: Table<Playlist, string>;
  history!: Table<HistoryEntry, string>;
  settings!: Table<AppSettings, string>;

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
        // Backfill artistNormalized for existing cart items
        await trans
          .table('cart')
          .toCollection()
          .modify((item: CartItem) => {
            if (!item.artistNormalized) {
              item.artistNormalized = (item.artist || '').toLowerCase().trim().replace(/\s+/g, ' ');
            }
          });

        // Backfill artistNormalized for existing history entries
        await trans
          .table('history')
          .toCollection()
          .modify((entry: HistoryEntry) => {
            if (!entry.artistNormalized) {
              entry.artistNormalized = (entry.artist || '').toLowerCase().trim().replace(/\s+/g, ' ');
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
      concurrencyLimit: 2
    });
  }
}
