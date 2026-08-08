import React, { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { CartItem } from '../db/database';
import { cartService } from '../services/cartService';
import { mediaRegistry } from '../services/mediaAssetRegistry';
import { getArtistSummary } from '../utils/artistUtils';
import {
  Trash2, Edit3, Music, CheckSquare, Square, Layers,
  ArrowRight, X, Play, Search, SlidersHorizontal, ChevronDown
} from 'lucide-react';

type SortKey = 'addedAt_desc' | 'addedAt_asc' | 'title_az' | 'artist_az' | 'duration_asc' | 'duration_desc' | 'status';

interface CartTabProps {
  onNavigate: (tab: string) => void;
  onPlayPreview: (track: { id: string; title: string; artist: string; thumbnailUrl: string; previewUrl: string }) => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const CartTab: React.FC<CartTabProps> = ({ onNavigate, onPlayPreview, showToast }) => {
  const items = useLiveQuery(() => db.cart.orderBy('addedAt').toArray()) || [];
  const playlists = useLiveQuery(() => db.playlists.toArray()) || [];

  // Search & filter states
  const [search, setSearch] = useState('');
  const [filterArtist, setFilterArtist] = useState('');
  const [filterFormat, setFilterFormat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('addedAt_desc');
  const [showFilters, setShowFilters] = useState(false);

  // Selection & bulk operation states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [bulkFormat, setBulkFormat] = useState<'mp3' | 'wav' | 'flac' | 'm4a' | 'mp4'>('mp3');
  const [bulkQuality, setBulkQuality] = useState<'128' | '192' | '256' | '320'>('320');
  const coverInputRef = React.useRef<HTMLInputElement>(null);

  // Distinct artist list for the filter dropdown
  const artistOptions = useMemo(() => getArtistSummary(items), [items]);

  // Active filters count
  const activeFilterCount = [filterArtist, filterFormat, filterStatus, filterSource, search].filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setFilterArtist('');
    setFilterFormat('');
    setFilterStatus('');
    setFilterSource('');
  };

  // Filtered + sorted items
  const displayItems = useMemo(() => {
    let result = [...items];

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.artist.toLowerCase().includes(q) ||
          (item.album || '').toLowerCase().includes(q) ||
          (item.genre || '').toLowerCase().includes(q)
      );
    }

    // Dropdown filters
    if (filterArtist) {
      result = result.filter((item) =>
        (item.artistNormalized || item.artist.toLowerCase().trim()) === filterArtist
      );
    }
    if (filterFormat) result = result.filter((item) => item.outputFormat === filterFormat);
    if (filterStatus) result = result.filter((item) => item.status === filterStatus);
    if (filterSource) result = result.filter((item) => item.source === filterSource);

    // Sort
    result.sort((a, b) => {
      switch (sortKey) {
        case 'addedAt_asc':   return a.addedAt - b.addedAt;
        case 'addedAt_desc':  return b.addedAt - a.addedAt;
        case 'title_az':      return a.title.localeCompare(b.title);
        case 'artist_az':     return a.artist.localeCompare(b.artist);
        case 'duration_asc':  return (a.duration || 0) - (b.duration || 0);
        case 'duration_desc': return (b.duration || 0) - (a.duration || 0);
        case 'status':        return a.status.localeCompare(b.status);
        default: return 0;
      }
    });

    return result;
  }, [items, search, filterArtist, filterFormat, filterStatus, filterSource, sortKey]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.length === displayItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayItems.map((x) => x.id));
    }
  };

  const deleteSelected = async () => {
    try {
      for (const id of selectedIds) await cartService.removeFromCart(id);
      showToast(`Removed ${selectedIds.length} items.`, 'success');
      setSelectedIds([]);
    } catch {
      showToast('Failed to delete selected items.', 'error');
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
      setShowBulkOptions(false);
    } catch {
      showToast('Failed to apply bulk settings.', 'error');
    }
  };

  const applyPreset = async (presetName: 'universal' | 'car' | 'dj' | 'hq' | 'small') => {
    if (selectedIds.length === 0) return;
    const presetMap: Record<string, { outputFormat: any; quality: any }> = {
      universal: { outputFormat: 'mp3', quality: '192' },
      car: { outputFormat: 'mp3', quality: '128' },
      dj: { outputFormat: 'wav', quality: '320' },
      hq: { outputFormat: 'flac', quality: '320' },
      small: { outputFormat: 'mp3', quality: '128' },
    };
    const preset = presetMap[presetName];
    try {
      await db.transaction('rw', db.cart, async () => {
        for (const id of selectedIds) await db.cart.update(id, preset);
      });
      showToast(`Applied "${presetName.toUpperCase()}" preset to ${selectedIds.length} tracks.`, 'success');
    } catch {
      showToast('Failed to apply preset.', 'error');
    }
  };

  const saveMetadataEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await db.cart.update(editingItem.id, {
        title: editingItem.title,
        artist: editingItem.artist,
        artistNormalized: editingItem.artist.toLowerCase().trim().replace(/\s+/g, ' '),
        album: editingItem.album,
        year: editingItem.year,
        genre: editingItem.genre,
        trackNumber: editingItem.trackNumber,
        outputFormat: editingItem.outputFormat,
        quality: editingItem.quality,
      });
      showToast('Metadata updated.', 'success');
      setEditingItem(null);
    } catch {
      showToast('Failed to update metadata.', 'error');
    }
  };

  const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && editingItem) {
      const file = e.target.files[0];
      mediaRegistry.registerLocalFile(`cover_${editingItem.id}`, file);
      showToast(`Selected "${file.name}" as cover art.`, 'success');
    }
  };

  const addToPlaylist = async (playlistId: string) => {
    if (selectedIds.length === 0) return;
    const pl = playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    try {
      const newItemIds = [...pl.itemIds];
      for (const id of selectedIds) {
        if (!newItemIds.includes(id)) newItemIds.push(id);
      }
      await db.playlists.update(playlistId, { itemIds: newItemIds });
      showToast(`Added ${selectedIds.length} items to "${pl.name}".`, 'success');
      setSelectedIds([]);
    } catch {
      showToast('Failed to add to playlist.', 'error');
    }
  };

  // Stats from filtered items only (when filtered) or all items
  const statsItems = activeFilterCount > 0 ? displayItems : items;
  const stats = useMemo(() => {
    const totalCount = statsItems.length;
    const totalDurationSec = statsItems.reduce((acc, item) => acc + (item.duration || 0), 0);
    const totalBytes = statsItems.reduce((acc, item) => {
      const rate = parseInt(item.quality || '320', 10);
      const duration = item.duration || 240;
      if (item.outputFormat === 'wav') return acc + duration * 176400;
      if (item.outputFormat === 'flac') return acc + duration * 88200;
      return acc + (rate * 1000 * duration) / 8;
    }, 0);
    const m = Math.floor(totalDurationSec / 60);
    const h = Math.floor(m / 60);
    const mRemaining = m % 60;
    return {
      totalCount,
      timeString: h > 0 ? `${h}h ${mRemaining}m` : `${m}m`,
      sizeString: `${Math.round(totalBytes / 1024 / 1024)} MB`,
    };
  }, [statsItems]);

  const formatSec = (sec: number) => {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const statusColor: Record<string, string> = {
    ready: '#22c55e',
    failed: '#ef4444',
    cancelled: '#f59e0b',
    processing: 'var(--accent)',
    pending: 'var(--text-muted)',
  };

  return (
    <div className="cart-tab animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0 }}>My Selection</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {items.length} tracks · configure and prepare for processing.
          </p>
        </div>
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={toggleSelectAll}>
              {selectedIds.length === displayItems.length && displayItems.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowBulkOptions(!showBulkOptions)}
              disabled={selectedIds.length === 0}
            >
              <Layers size={15} /> Bulk
            </button>
            <button className="btn btn-danger" onClick={deleteSelected} disabled={selectedIds.length === 0}>
              <Trash2 size={15} /> Delete ({selectedIds.length})
            </button>
          </div>
        )}
      </div>

      {/* Search + Filter bar */}
      {items.length > 0 && (
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flexGrow: 1, minWidth: '180px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="input"
              placeholder="Search title, artist, album…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
          </div>

          {/* Filter toggle */}
          <button
            className={`btn ${showFilters || activeFilterCount > 0 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowFilters(!showFilters)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '1px 6px', fontSize: '11px' }}>
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Sort */}
          <div style={{ position: 'relative' }}>
            <select
              className="input"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              style={{ paddingRight: '28px', appearance: 'none', minWidth: '140px' }}
            >
              <option value="addedAt_desc">Newest first</option>
              <option value="addedAt_asc">Oldest first</option>
              <option value="title_az">Title A–Z</option>
              <option value="artist_az">Artist A–Z</option>
              <option value="duration_asc">Shortest first</option>
              <option value="duration_desc">Longest first</option>
              <option value="status">Status</option>
            </select>
            <ChevronDown size={13} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
          </div>

          {activeFilterCount > 0 && (
            <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={clearFilters}>
              <X size={12} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Filter dropdowns */}
      {showFilters && items.length > 0 && (
        <div className="card animate-slide-down" style={{ marginBottom: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', padding: '14px 16px' }}>
          {/* Artist filter */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Artist</label>
            <select className="input" style={{ minWidth: '140px' }} value={filterArtist} onChange={(e) => setFilterArtist(e.target.value)}>
              <option value="">All Artists</option>
              {artistOptions.map((a) => (
                <option key={a.key} value={a.key}>{a.displayName} ({a.count})</option>
              ))}
            </select>
          </div>
          {/* Format filter */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Format</label>
            <select className="input" value={filterFormat} onChange={(e) => setFilterFormat(e.target.value)}>
              <option value="">All Formats</option>
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="flac">FLAC</option>
              <option value="m4a">M4A</option>
              <option value="mp4">MP4</option>
            </select>
          </div>
          {/* Status filter */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Status</label>
            <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="ready">Ready</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {/* Source filter */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Source</label>
            <select className="input" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
              <option value="">All Sources</option>
              <option value="local">Local File</option>
              <option value="youtube">YouTube</option>
              <option value="direct">Direct URL</option>
            </select>
          </div>
        </div>
      )}

      {/* Bulk Operations sub-panel */}
      {showBulkOptions && selectedIds.length > 0 && (
        <div className="card animate-slide-down" style={{ marginBottom: '12px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', padding: '14px 16px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Format</label>
            <select className="input" style={{ width: '90px' }} value={bulkFormat} onChange={(e: any) => setBulkFormat(e.target.value)}>
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="flac">FLAC</option>
              <option value="m4a">M4A</option>
            </select>
          </div>
          {['mp3', 'm4a'].includes(bulkFormat) && (
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Quality</label>
              <select className="input" style={{ width: '90px' }} value={bulkQuality} onChange={(e: any) => setBulkQuality(e.target.value)}>
                <option value="128">128k</option>
                <option value="192">192k</option>
                <option value="256">256k</option>
                <option value="320">320k</option>
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Presets</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['universal', 'car', 'dj', 'hq'].map((p) => (
                <button key={p} className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={() => applyPreset(p as any)}>
                  {p === 'universal' ? 'Universal' : p === 'car' ? 'Car' : p === 'dj' ? 'DJ WAV' : 'HQ FLAC'}
                </button>
              ))}
            </div>
          </div>
          {playlists.length > 0 && (
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Add to Playlist</label>
              <select className="input" style={{ width: '140px' }} onChange={(e) => addToPlaylist(e.target.value)} defaultValue="">
                <option value="" disabled>Select…</option>
                {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={applyBulkSettings}>
            Apply to {selectedIds.length}
          </button>
        </div>
      )}

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {filterArtist && (
            <span className="filter-chip">Artist: {artistOptions.find((a) => a.key === filterArtist)?.displayName} <X size={10} style={{ cursor: 'pointer', marginLeft: '3px' }} onClick={() => setFilterArtist('')} /></span>
          )}
          {filterFormat && (
            <span className="filter-chip">Format: {filterFormat.toUpperCase()} <X size={10} style={{ cursor: 'pointer', marginLeft: '3px' }} onClick={() => setFilterFormat('')} /></span>
          )}
          {filterStatus && (
            <span className="filter-chip">Status: {filterStatus} <X size={10} style={{ cursor: 'pointer', marginLeft: '3px' }} onClick={() => setFilterStatus('')} /></span>
          )}
          {filterSource && (
            <span className="filter-chip">Source: {filterSource} <X size={10} style={{ cursor: 'pointer', marginLeft: '3px' }} onClick={() => setFilterSource('')} /></span>
          )}
          {search && (
            <span className="filter-chip">Search: "{search}" <X size={10} style={{ cursor: 'pointer', marginLeft: '3px' }} onClick={() => setSearch('')} /></span>
          )}
        </div>
      )}

      {/* Track list */}
      <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
        {items.length === 0 ? (
          <div className="empty-state">
            <Music size={48} className="empty-state-icon" />
            <div className="empty-state-title">Your Cart is Empty</div>
            <p>Go to Discover or Import to add tracks here.</p>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => onNavigate('search')}>
              Browse Music
            </button>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px' }}>
            <Search size={36} className="empty-state-icon" />
            <div className="empty-state-title">No Matches</div>
            <p>No tracks match your current filters.</p>
            <button className="btn btn-secondary" style={{ marginTop: '12px' }} onClick={clearFilters}>Clear Filters</button>
          </div>
        ) : (
          displayItems.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const isYouTube = item.source === 'youtube';

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: isSelected ? 'var(--accent-muted)' : 'var(--bg-card)',
                  border: '1px solid',
                  borderColor: isSelected ? 'rgba(204, 255, 0, 0.25)' : 'var(--border-subtle)',
                  transition: 'var(--transition-fast)',
                  gap: '12px',
                }}
              >
                {/* Checkbox */}
                <div style={{ cursor: 'pointer', color: isSelected ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} onClick={() => toggleSelect(item.id)}>
                  {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                </div>

                {/* Thumbnail */}
                <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'var(--bg-hover)', flexShrink: 0 }}>
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                      <Music size={16} />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                      {item.artist}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {formatSec(item.duration)}
                    </span>
                    <span style={{
                      fontSize: '9px', fontWeight: '700', padding: '1px 4px', borderRadius: '3px',
                      backgroundColor: isYouTube ? '#ff0000' : 'rgba(255,255,255,0.08)',
                      color: '#ffffff', textTransform: 'uppercase'
                    }}>
                      {item.source}
                    </span>
                  </div>
                </div>

                {/* Format + Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {item.outputFormat.toUpperCase()}
                    {['mp3', 'm4a'].includes(item.outputFormat) && ` ${item.quality}k`}
                  </span>
                  <span style={{ fontSize: '10px', color: statusColor[item.status] || 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                    {item.status}
                  </span>
                  {isYouTube && (
                    <span style={{ fontSize: '9px', padding: '2px 5px', borderRadius: '4px', backgroundColor: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                      Preview Only
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {item.sourceUrl && (
                    <button className="btn btn-secondary btn-icon-only" title="Preview" onClick={() => onPlayPreview({ id: item.id, title: item.title, artist: item.artist, thumbnailUrl: item.thumbnailUrl || '', previewUrl: item.sourceUrl! })}>
                      <Play size={12} />
                    </button>
                  )}
                  <button className="btn btn-secondary btn-icon-only" title="Edit metadata" onClick={() => setEditingItem(item)}>
                    <Edit3 size={12} />
                  </button>
                  <button className="btn btn-secondary btn-icon-only" title="Delete" onClick={() => cartService.removeFromCart(item.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer stats */}
      {items.length > 0 && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', backgroundColor: '#0c0c0c', borderTop: '2px solid var(--accent-muted)', marginTop: 'auto', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                {activeFilterCount > 0 ? 'Filtered' : 'Total'} Items
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>
                {stats.totalCount}
                {activeFilterCount > 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>/ {items.length}</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Duration</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{stats.timeString}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Est. Output</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent)' }}>~ {stats.sizeString}</div>
            </div>
          </div>
          <button className="btn btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }} onClick={() => onNavigate('process')}>
            Process Queue <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Edit metadata modal */}
      {editingItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <form className="card" onSubmit={saveMetadataEdit} style={{ maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Edit Metadata (ID3 Tags)</h2>
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
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Track #</label>
                <input type="text" className="input" style={{ width: '100px' }} value={editingItem.trackNumber || ''} onChange={(e) => setEditingItem({ ...editingItem, trackNumber: e.target.value })} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Format & Bitrate</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select className="input" value={editingItem.outputFormat} onChange={(e: any) => setEditingItem({ ...editingItem, outputFormat: e.target.value })}>
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                    <option value="flac">FLAC</option>
                    <option value="m4a">M4A</option>
                  </select>
                  {['mp3', 'm4a'].includes(editingItem.outputFormat) && (
                    <select className="input" value={editingItem.quality} onChange={(e: any) => setEditingItem({ ...editingItem, quality: e.target.value })}>
                      <option value="128">128 kbps</option>
                      <option value="192">192 kbps</option>
                      <option value="256">256 kbps</option>
                      <option value="320">320 kbps</option>
                    </select>
                  )}
                </div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Custom Cover Art (JPEG/PNG)</label>
                <input type="file" ref={coverInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleCoverSelect} />
                <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => coverInputRef.current?.click()}>
                  Choose Image…
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingItem(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Tags</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
