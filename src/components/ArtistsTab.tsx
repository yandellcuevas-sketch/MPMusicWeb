import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { CartItem, Playlist } from '../db/database';
import { cartService } from '../services/cartService';
import { normalizeArtist, getArtistSummary, formatDuration, getArtistInitials, getArtistHue } from '../utils/artistUtils';
import {
  Users, ArrowLeft, Music, Trash2, Edit3,
  CheckSquare, Layers, Play, ArrowRight, X, HardDrive, ListMusic, Plus
} from 'lucide-react';

interface ArtistsTabProps {
  onNavigate: (tab: string) => void;
  onPlayPreview: (track: { id: string; title: string; artist: string; thumbnailUrl: string; previewUrl: string }) => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  onProcessSelected?: (ids: string[]) => void;
  onExportSelected?: (ids: string[]) => void;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
const ArtistAvatar: React.FC<{ name: string; thumbnailUrl?: string; size?: number }> = ({
  name,
  thumbnailUrl,
  size = 64,
}) => {
  const hue = getArtistHue(name);
  const initials = getArtistInitials(name);

  if (thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, hsl(${hue}, 60%, 28%), hsl(${(hue + 40) % 360}, 50%, 18%))`,
        border: `2px solid hsl(${hue}, 50%, 35%)`,
        fontSize: size > 40 ? '18px' : '13px', fontWeight: '700',
        color: `hsl(${hue}, 80%, 85%)`, letterSpacing: '1px', userSelect: 'none',
      }}
    >
      {initials}
    </div>
  );
};

// ─── Artist Card ──────────────────────────────────────────────────────────────
interface ArtistCardProps {
  displayName: string;
  count: number;
  totalDuration: number;
  thumbnailUrl?: string;
  onClick: () => void;
}

const ArtistCard: React.FC<ArtistCardProps> = ({ displayName, count, totalDuration, thumbnailUrl, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="artist-card"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
        padding: '24px 16px', borderRadius: '12px', backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)', cursor: 'pointer', textAlign: 'center',
      }}
    >
      <ArtistAvatar name={displayName} thumbnailUrl={thumbnailUrl} size={72} />
      <div>
        <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '4px', lineHeight: '1.3' }}>
          {displayName}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {count} {count === 1 ? 'track' : 'tracks'}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {formatDuration(totalDuration)}
        </div>
      </div>
    </div>
  );
};

// ─── Add to Playlist modal ────────────────────────────────────────────────────
interface PlaylistPickerProps {
  playlists: Playlist[];
  onSelect: (playlistId: string) => void;
  onCreateAndAdd: (name: string) => void;
  onClose: () => void;
}

const PlaylistPicker: React.FC<PlaylistPickerProps> = ({ playlists, onSelect, onCreateAndAdd, onClose }) => {
  const [newName, setNewName] = useState('');

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, padding: '20px',
    }}>
      <div className="card" style={{ maxWidth: '380px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>Add to Playlist</h3>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Existing playlists */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto', marginBottom: '16px' }}>
          {playlists.length === 0 && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
              No playlists yet. Create one below.
            </p>
          )}
          {playlists.map((pl) => (
            <button
              key={pl.id}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start', gap: '8px', textAlign: 'left' }}
              onClick={() => onSelect(pl.id)}
            >
              <ListMusic size={14} />
              {pl.name}
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {pl.itemIds.length} tracks
              </span>
            </button>
          ))}
        </div>

        {/* Create new */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Create new playlist & add
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="input"
              placeholder="Playlist name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { onCreateAndAdd(newName.trim()); } }}
            />
            <button
              className="btn btn-primary btn-icon-only"
              disabled={!newName.trim()}
              onClick={() => onCreateAndAdd(newName.trim())}
              title="Create and add"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Tab ─────────────────────────────────────────────────────────────────
export const ArtistsTab: React.FC<ArtistsTabProps> = ({
  onNavigate,
  onPlayPreview,
  showToast,
  onProcessSelected,
  onExportSelected,
}) => {
  const allItems = useLiveQuery(() => db.cart.orderBy('addedAt').toArray()) || [];
  const playlists = useLiveQuery(() => db.playlists.toArray()) || [];

  const [activeArtistKey, setActiveArtistKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [bulkFormat, setBulkFormat] = useState<'mp3' | 'wav' | 'flac' | 'm4a' | 'mp4'>('mp3');
  const [bulkQuality, setBulkQuality] = useState<'128' | '192' | '256' | '320'>('320');
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);

  const artistSummaries = useMemo(() => getArtistSummary(allItems), [allItems]);

  const filteredArtists = useMemo(() => {
    if (!searchQuery.trim()) return artistSummaries;
    const q = searchQuery.toLowerCase();
    return artistSummaries.filter((a) => a.displayName.toLowerCase().includes(q));
  }, [artistSummaries, searchQuery]);

  const activeArtistData = useMemo(() => {
    if (!activeArtistKey) return null;
    const summary = artistSummaries.find((a) => a.key === activeArtistKey);
    if (!summary) return null;
    const tracks = allItems.filter(
      (item) => normalizeArtist(item.artist) === activeArtistKey
    );
    return { ...summary, tracks };
  }, [activeArtistKey, artistSummaries, allItems]);

  const artistStats = useMemo(() => {
    if (!activeArtistData) return null;
    const { tracks } = activeArtistData;
    const totalDuration = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    const estimatedBytes = tracks.reduce((acc, t) => {
      const rate = parseInt(t.quality || '320', 10);
      const dur = t.duration || 240;
      if (t.outputFormat === 'wav') return acc + dur * 176400;
      if (t.outputFormat === 'flac') return acc + dur * 88200;
      return acc + (rate * 1000 * dur) / 8;
    }, 0);
    const pending = tracks.filter((t) => t.status === 'pending' || t.status === 'failed').length;
    return {
      count: tracks.length,
      duration: formatDuration(totalDuration),
      estimatedMB: Math.round(estimatedBytes / 1024 / 1024),
      pending,
    };
  }, [activeArtistData]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (!activeArtistData) return;
    const ids = activeArtistData.tracks.map((t) => t.id);
    setSelectedIds((prev) => (prev.length === ids.length ? [] : ids));
  };

  const deleteSelected = async () => {
    try {
      for (const id of selectedIds) await cartService.removeFromCart(id);
      showToast(`Removed ${selectedIds.length} tracks.`, 'success');
      setSelectedIds([]);
      if (activeArtistData && activeArtistData.tracks.length === selectedIds.length) {
        setActiveArtistKey(null);
      }
    } catch {
      showToast('Failed to delete tracks.', 'error');
    }
  };

  const applyBulkSettings = async () => {
    if (selectedIds.length === 0) return;
    try {
      await db.transaction('rw', db.cart, async () => {
        for (const id of selectedIds) {
          await db.cart.update(id, { outputFormat: bulkFormat, quality: bulkQuality });
        }
      });
      showToast(`Applied settings to ${selectedIds.length} tracks.`, 'success');
      setShowBulkPanel(false);
    } catch {
      showToast('Failed to apply settings.', 'error');
    }
  };

  /**
   * Process selected IDs only.
   * Calls onProcessSelected with selectedIds to navigate to ProcessTab scoped to this selection.
   */
  const handleProcessSelected = () => {
    if (selectedIds.length === 0) return;

    if (onProcessSelected) {
      onProcessSelected(selectedIds);
    } else {
      onNavigate('process');
    }
  };

  /**
   * Export selected ready IDs.
   * Calls onExportSelected with ready selected IDs to navigate to UsbTab scoped to this selection.
   */
  const handleExportSelected = () => {
    if (selectedIds.length === 0) return;

    const readySelected = selectedIds.filter((id) => {
      const item = allItems.find((i) => i.id === id);
      return item?.status === 'ready';
    });

    if (readySelected.length === 0) {
      showToast('None of the selected tracks are ready. Process them first.', 'error');
      return;
    }

    if (onExportSelected) {
      onExportSelected(readySelected);
    } else {
      onNavigate('usb');
    }
  };

  /**
   * Add selectedIds to an existing playlist.
   * Avoids duplicates within the playlist.
   */
  const handleAddToExistingPlaylist = async (playlistId: string) => {
    if (selectedIds.length === 0) return;
    const pl = playlists.find((p) => p.id === playlistId);
    if (!pl) return;

    try {
      const newItemIds = [...pl.itemIds];
      let added = 0;
      for (const id of selectedIds) {
        if (!newItemIds.includes(id)) {
          newItemIds.push(id);
          added++;
        }
      }
      await db.playlists.update(playlistId, { itemIds: newItemIds });
      showToast(
        added > 0
          ? `Added ${added} tracks to "${pl.name}".`
          : `All selected tracks are already in "${pl.name}".`,
        added > 0 ? 'success' : 'info'
      );
      setShowPlaylistPicker(false);
    } catch {
      showToast('Failed to add to playlist.', 'error');
    }
  };

  /**
   * Create a new playlist and add selectedIds to it.
   */
  const handleCreateAndAddPlaylist = async (name: string) => {
    if (selectedIds.length === 0 || !name.trim()) return;
    try {
      const id = `pl_${Math.random().toString(36).substring(7)}_${Date.now()}`;
      await db.playlists.put({
        id,
        name: name.trim(),
        createdAt: Date.now(),
        itemIds: [...selectedIds],
      });
      showToast(`Created playlist "${name}" with ${selectedIds.length} tracks.`, 'success');
      setShowPlaylistPicker(false);
    } catch {
      showToast('Failed to create playlist.', 'error');
    }
  };

  const saveMetadataEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await db.cart.update(editingItem.id, {
        title: editingItem.title,
        artist: editingItem.artist,
        artistNormalized: normalizeArtist(editingItem.artist),
        album: editingItem.album,
        year: editingItem.year,
        genre: editingItem.genre,
        outputFormat: editingItem.outputFormat,
        quality: editingItem.quality,
      });
      showToast('Metadata updated.', 'success');
      setEditingItem(null);
    } catch {
      showToast('Failed to update metadata.', 'error');
    }
  };

  const formatSec = (sec: number) => {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const statusColor: Record<string, string> = {
    ready: 'var(--success)',
    failed: 'var(--danger)',
    cancelled: 'var(--warning)',
    processing: 'var(--accent)',
    pending: 'var(--text-muted)',
  };

  // ── Grid view ──────────────────────────────────────────────────────────────
  if (!activeArtistKey) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0 }}>Artists</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              {artistSummaries.length} artists · {allItems.length} tracks total
            </p>
          </div>
          <input
            type="text"
            className="input"
            placeholder="Search artists…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '220px' }}
          />
        </div>

        {allItems.length === 0 ? (
          <div className="empty-state">
            <Users size={48} className="empty-state-icon" />
            <div className="empty-state-title">No Artists Yet</div>
            <p>Import or discover music to see your artists here.</p>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => onNavigate('search')}>
              Discover Music
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px', overflowY: 'auto', paddingBottom: '32px' }}>
            {filteredArtists.map((artist) => {
              const thumb = allItems.find(
                (item) => normalizeArtist(item.artist) === artist.key && item.thumbnailUrl
              )?.thumbnailUrl;

              return (
                <ArtistCard
                  key={artist.key}
                  displayName={artist.displayName}
                  count={artist.count}
                  totalDuration={artist.totalDuration}
                  thumbnailUrl={thumb}
                  onClick={() => { setActiveArtistKey(artist.key); setSelectedIds([]); }}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Artist detail view ─────────────────────────────────────────────────────
  if (!activeArtistData) return null;
  const { displayName, tracks } = activeArtistData;
  const allSelected = selectedIds.length === tracks.length && tracks.length > 0;
  const thumb = tracks.find((t) => t.thumbnailUrl)?.thumbnailUrl;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Back + header */}
      <div style={{ marginBottom: '20px' }}>
        <button
          className="btn btn-secondary"
          style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={() => { setActiveArtistKey(null); setSelectedIds([]); setShowBulkPanel(false); }}
        >
          <ArrowLeft size={14} /> All Artists
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <ArtistAvatar name={displayName} thumbnailUrl={thumb} size={80} />
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <h1 style={{ margin: '0 0 6px', fontSize: '26px', fontWeight: '800' }}>{displayName}</h1>
            {artistStats && (
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{artistStats.count} tracks</span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{artistStats.duration}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>~{artistStats.estimatedMB} MB</span>
                {artistStats.pending > 0 && (
                  <span style={{ fontSize: '13px', color: 'var(--warning)' }}>{artistStats.pending} pending</span>
                )}
              </div>
            )}
          </div>

          {/* Action bar */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
            <button className="btn btn-secondary" onClick={toggleSelectAll}>
              {allSelected ? 'Deselect All' : `Select All ${tracks.length}`}
            </button>

            {selectedIds.length > 0 && (
              <>
                <button className="btn btn-secondary" onClick={() => setShowBulkPanel(!showBulkPanel)} title="Format & quality">
                  <Layers size={14} />
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowPlaylistPicker(true)}
                  title="Add to playlist"
                >
                  <ListMusic size={14} /> Playlist
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleProcessSelected}
                  title="Process selected tracks only"
                >
                  <ArrowRight size={14} /> Process {selectedIds.length}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleExportSelected}
                  title="Export selected ready tracks to USB"
                >
                  <HardDrive size={14} /> Export
                </button>
                <button className="btn btn-danger" onClick={deleteSelected} title="Delete selected">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bulk format panel */}
      {showBulkPanel && selectedIds.length > 0 && (
        <div className="card animate-slide-down" style={{ marginBottom: '14px', display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Format</label>
            <select className="input" style={{ width: '90px' }} value={bulkFormat} onChange={(e: any) => setBulkFormat(e.target.value)}>
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="flac">FLAC</option>
              <option value="m4a">M4A</option>
            </select>
          </div>
          {['mp3', 'm4a'].includes(bulkFormat) && (
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Quality</label>
              <select className="input" style={{ width: '90px' }} value={bulkQuality} onChange={(e: any) => setBulkQuality(e.target.value)}>
                <option value="128">128k</option>
                <option value="192">192k</option>
                <option value="256">256k</option>
                <option value="320">320k</option>
              </select>
            </div>
          )}
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={applyBulkSettings}>
            Apply to {selectedIds.length}
          </button>
        </div>
      )}

      {/* Track list */}
      <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {tracks.map((item, idx) => {
          const isSelected = selectedIds.includes(item.id);
          return (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: '8px',
                backgroundColor: isSelected ? 'var(--accent-muted)' : 'var(--bg-card)',
                border: '1px solid',
                borderColor: isSelected ? 'rgba(204,255,0,0.25)' : 'var(--border-subtle)',
                transition: 'var(--transition-fast)', gap: '12px',
              }}
            >
              {/* Index / checkbox */}
              <div
                style={{ width: '28px', textAlign: 'center', cursor: 'pointer', color: isSelected ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}
                onClick={() => toggleSelect(item.id)}
              >
                {isSelected
                  ? <CheckSquare size={16} />
                  : <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{String(idx + 1).padStart(2, '0')}</span>}
              </div>

              {/* Thumbnail */}
              <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'var(--bg-hover)', flexShrink: 0 }}>
                {item.thumbnailUrl
                  ? <img src={item.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}><Music size={14} /></div>
                }
              </div>

              {/* Info */}
              <div style={{ flexGrow: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                  {formatSec(item.duration)}{item.album && ` · ${item.album}`}{item.genre && ` · ${item.genre}`}
                </div>
              </div>

              {/* Format + status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {item.outputFormat.toUpperCase()}{['mp3', 'm4a'].includes(item.outputFormat) ? ` ${item.quality}k` : ''}
                </span>
                <span style={{ fontSize: '10px', color: statusColor[item.status] || 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                  {item.status}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                {item.sourceUrl && (
                  <button className="btn btn-secondary btn-icon-only" title="Preview"
                    onClick={() => onPlayPreview({ id: item.id, title: item.title, artist: item.artist, thumbnailUrl: item.thumbnailUrl || '', previewUrl: item.sourceUrl! })}>
                    <Play size={12} />
                  </button>
                )}
                <button className="btn btn-secondary btn-icon-only" title="Edit" onClick={() => setEditingItem(item)}>
                  <Edit3 size={12} />
                </button>
                <button className="btn btn-secondary btn-icon-only" title="Remove" onClick={() => cartService.removeFromCart(item.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Playlist picker modal */}
      {showPlaylistPicker && (
        <PlaylistPicker
          playlists={playlists}
          onSelect={handleAddToExistingPlaylist}
          onCreateAndAdd={handleCreateAndAddPlaylist}
          onClose={() => setShowPlaylistPicker(false)}
        />
      )}

      {/* Edit metadata modal */}
      {editingItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <form className="card" onSubmit={saveMetadataEdit} style={{ maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Edit Metadata</h2>
              <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setEditingItem(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Title</label>
                <input type="text" className="input" value={editingItem.title} onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })} required />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Artist</label>
                <input type="text" className="input" value={editingItem.artist} onChange={(e) => setEditingItem({ ...editingItem, artist: e.target.value })} required />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Album</label>
                <input type="text" className="input" value={editingItem.album || ''} onChange={(e) => setEditingItem({ ...editingItem, album: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Genre</label>
                <input type="text" className="input" value={editingItem.genre || ''} onChange={(e) => setEditingItem({ ...editingItem, genre: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Year</label>
                <input type="text" className="input" value={editingItem.year || ''} onChange={(e) => setEditingItem({ ...editingItem, year: e.target.value })} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Format & Quality</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select className="input" value={editingItem.outputFormat} onChange={(e: any) => setEditingItem({ ...editingItem, outputFormat: e.target.value })}>
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                    <option value="flac">FLAC</option>
                    <option value="m4a">M4A</option>
                  </select>
                  {['mp3', 'm4a'].includes(editingItem.outputFormat) && (
                    <select className="input" value={editingItem.quality} onChange={(e: any) => setEditingItem({ ...editingItem, quality: e.target.value })}>
                      <option value="128">128k</option>
                      <option value="192">192k</option>
                      <option value="256">256k</option>
                      <option value="320">320k</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingItem(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
