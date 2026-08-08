import Dexie, { type Table } from 'dexie';

export interface CartItem {
  id: string; // Unique ID (e.g. YouTube video ID or random UUID)
  source: 'youtube' | 'local' | 'direct';
  sourceId?: string;
  sourceUrl?: string;
  title: string;
  artist: string;
  album?: string;
  year?: string;
  genre?: string;
  trackNumber?: string;
  thumbnailUrl?: string;
  duration: number; // in seconds
  addedAt: number;
  outputFormat: 'mp3' | 'mp4' | 'wav' | 'flac' | 'm4a';
  quality: '128' | '192' | '256' | '320';
  status: 'pending' | 'preparing' | 'processing' | 'tagging' | 'ready' | 'failed' | 'cancelled';
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
    this.version(1).stores({
      cart: 'id, source, title, artist, status, addedAt',
      playlists: 'id, name, createdAt',
      history: 'id, title, artist, processedAt, status',
      settings: 'id'
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
