import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { CartItem } from '../db/database';
import { cartService } from '../services/cartService';
import { mediaRegistry } from '../services/mediaAssetRegistry';
import { getArtistSummary, normalizeArtist } from '../utils/artistUtils';
import {
  Trash2, Edit3, Music, CheckSquare, Square, Layers,
  ArrowRight, X, Play, Search, SlidersHorizontal, Upload,
  RefreshCw, CheckCircle2, AlertCircle, HelpCircle, ShieldCheck
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
  const [reviewingMatchItem, setReviewingMatchItem] = useState<CartItem | null>(null);
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [bulkFormat, setBulkFormat] = useState<'mp3' | 'wav' | 'flac' | 'm4a' | 'mp4'>('mp3');
  const [bulkQuality, setBulkQuality] = useState<'128' | '192' | '256' | '320'>('320');
  const coverInputRef = useRef<HTMLInputElement>(null);

  // File attachment for preview-only / source_required items
  const [attachTargetId, setAttachTargetId] = useState<string | null>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

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
        (item.artistNormalized || normalizeArtist(item.artist)) === filterArtist
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
    const visibleIds = displayItems.map((i) => i.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) =>
      allSelected ? prev.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds]))
    );
  };

  const deleteSelected = async () => {
    try {
      for (const id of selectedIds) {
        await cartService.removeFromCart(id);
      }
      showToast(`Removed ${selectedIds.length} items from cart.`, 'success');
      setSelectedIds([]);
    } catch {
      showToast('Failed to delete items.', 'error');
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
      showToast(`Updated format on ${selectedIds.length} tracks.`, 'success');
      setShowBulkOptions(false);
    } catch {
      showToast('Failed to update formats.', 'error');
    }
  };

  const applyPreset = async (presetName: 'universal' | 'car' | 'dj' | 'hq') => {
    if (selectedIds.length === 0) return;
    const formatMap: Record<string, 'mp3' | 'wav' | 'flac'> = {
      universal: 'mp3',
      car: 'mp3',
      dj: 'wav',
      hq: 'flac',
    };
    const qualityMap: Record<string, '128' | '192' | '256' | '320'> = {
      universal: '320',
      car: '192',
      dj: '320',
      hq: '320',
    };
    try {
      await db.transaction('rw', db.cart, async () => {
        for (const id of selectedIds) {
          await db.cart.update(id, {
            outputFormat: formatMap[presetName] || 'mp3',
            quality: qualityMap[presetName] || '320',
          });
        }
      });
      showToast(`Applied "${presetName.toUpperCase()}" preset to ${selectedIds.length} tracks.`, 'success');
    } catch {
      showToast('Failed to apply preset.', 'error');
    }
  };

  const triggerAttachFile = (itemId: string) => {
    setAttachTargetId(itemId);
    if (attachInputRef.current) {
      attachInputRef.current.value = '';
      attachInputRef.current.click();
    }
  };

  const handleFileAttachChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && attachTargetId) {
      const file = e.target.files[0];
      const targetItem = items.find((i) => i.id === attachTargetId);
      try {
        await cartService.attachLocalFile(attachTargetId, file);
        showToast(`Attached "${file.name}" to "${targetItem?.title || 'track'}". Audio available!`, 'success');
      } catch {
        showToast('Failed to attach source file.', 'error');
      } finally {
        setAttachTargetId(null);
      }
    }
  };

  const handleRetryResolution = async (id: string) => {
    showToast('Searching for authorized audio source...', 'info');
    await cartService.retryResolution(id);
  };

  const handleAcceptMatch = async (id: string) => {
    await cartService.acceptResolutionMatch(id);
    setReviewingMatchItem(null);
    showToast('Match accepted. Audio is ready to process!', 'success');
  };

  const handleRejectMatch = async (id: string) => {
    await cartService.rejectResolutionMatch(id);
    setReviewingMatchItem(null);
    showToast('Match rejected.', 'info');
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

  // Resolution statistics
  const resolutionStats = useMemo(() => {
    const total = items.length;
    const resolved = items.filter((i) => i.audioResolutionStatus === 'resolved' || i.source === 'local' || mediaRegistry.hasLocalFile(i.id)).length;
    const resolving = items.filter((i) => i.audioResolutionStatus === 'resolving').length;
    const ambiguous = items.filter((i) => i.audioResolutionStatus === 'ambiguous').length;
    const unavailable = items.filter((i) => i.audioResolutionStatus === 'unavailable' || i.audioResolutionStatus === 'failed').length;

    return {
      total,
      resolved,
      resolving,
      ambiguous,
      unavailable,
    };
  }, [items]);

  const availableToProcessIds = useMemo(() => {
    return items
      .filter((i) => i.audioResolutionStatus === 'resolved' || i.source === 'local' || mediaRegistry.hasLocalFile(i.id))
      .map((i) => i.id);
  }, [items]);

  const formatSec = (sec: number) => {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const renderResolutionBadge = (item: CartItem) => {
    const isLocal = item.source === 'local' || mediaRegistry.hasLocalFile(item.id);
    const resStatus = isLocal ? 'resolved' : (item.audioResolutionStatus || 'idle');

    if (resStatus === 'resolving') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            color: 'var(--accent)',
            backgroundColor: 'rgba(204, 255, 0, 0.08)',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: '600',
          }}
        >
          <RefreshCw size={11} className="animate-spin" /> Finding audio...
        </span>
      );
    }

    if (resStatus === 'resolved') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            color: 'var(--success)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: '600',
          }}
          title={item.resolvedMedia ? `Resolved from ${item.resolvedMedia.provider} (${(item.resolvedMedia.confidence * 100).toFixed(0)}% match)` : 'Audio available'}
        >
          <CheckCircle2 size={11} /> Audio available ✓
        </span>
      );
    }

    if (resStatus === 'ambiguous') {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: 'var(--warning)',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: '600',
            }}
          >
            <HelpCircle size={11} /> Needs review
          </span>
          <button
            className="btn btn-secondary"
            style={{ fontSize: '11px', padding: '2px 6px' }}
            onClick={() => setReviewingMatchItem(item)}
          >
            Review match
          </button>
        </div>
      );
    }

    // Unavailable / Failed / Idle
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: '500',
          }}
        >
          <AlertCircle size={11} /> Audio unavailable
        </span>
        <button
          className="btn btn-secondary btn-icon-only"
          style={{ width: '24px', height: '24px', padding: 0 }}
          onClick={() => handleRetryResolution(item.id)}
          title="Retry resolution"
        >
          <RefreshCw size={11} />
        </button>
        <button
          className="btn btn-secondary"
          style={{ fontSize: '11px', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={() => triggerAttachFile(item.id)}
          title="Attach local audio file"
        >
          <Upload size={11} /> Attach file
        </button>
      </div>
    );
  };

  return (
    <div className="cart-tab animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Hidden file input for attaching local media source */}
      <input
        type="file"
        ref={attachInputRef}
        style={{ display: 'none' }}
        accept="audio/*,video/*,.mp3,.mp4,.wav,.flac,.m4a,.webm,.ogg"
        onChange={handleFileAttachChange}
      />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0 }}>My Selection</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {items.length} tracks in selection · {resolutionStats.resolved} ready for processing.
          </p>
        </div>
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowFilters(!showFilters)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span style={{ backgroundColor: 'var(--accent)', color: '#000', borderRadius: '10px', padding: '1px 6px', fontSize: '10px', fontWeight: '700' }}>
                  {activeFilterCount}
                </span>
              )}
            </button>

            {selectedIds.length > 0 && (
              <>
                <button
                  className={`btn ${showBulkOptions ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setShowBulkOptions(!showBulkOptions)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Layers size={14} /> Bulk ({selectedIds.length})
                </button>
                <button className="btn btn-danger btn-icon-only" onClick={deleteSelected} title="Delete selected">
                  <Trash2 size={14} />
                </button>
              </>
            )}

            <button
              className="btn btn-primary"
              disabled={availableToProcessIds.length === 0}
              onClick={() => {
                sessionStorage.setItem('processing_selection_ids', JSON.stringify(availableToProcessIds));
                onNavigate('process');
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Process {availableToProcessIds.length} Available <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Summary Chips Bar */}
      {items.length > 0 && (
        <div
          className="card"
          style={{
            padding: '10px 16px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            backgroundColor: '#0c0c0c',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '12px' }}>
            <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
              SELECTION: {resolutionStats.total}
            </span>
            <span style={{ color: 'var(--success)' }}>
              ● {resolutionStats.resolved} Available
            </span>
            {resolutionStats.resolving > 0 && (
              <span style={{ color: 'var(--accent)' }}>
                ● {resolutionStats.resolving} Searching...
              </span>
            )}
            {resolutionStats.ambiguous > 0 && (
              <span style={{ color: 'var(--warning)' }}>
                ● {resolutionStats.ambiguous} Needs Review
              </span>
            )}
            {resolutionStats.unavailable > 0 && (
              <span style={{ color: 'var(--text-muted)' }}>
                ● {resolutionStats.unavailable} Unavailable
              </span>
            )}
          </div>
        </div>
      )}

      {/* Search Bar + Sort selector */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flexGrow: 1, minWidth: '200px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input"
              style={{ paddingLeft: '32px', fontSize: '13px', height: '36px' }}
              placeholder="Search by title, artist, album, genre…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <X size={13} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setSearch('')} />
            )}
          </div>

          <select className="input" style={{ width: 'auto', minWidth: '150px', fontSize: '12px', height: '36px' }} value={sortKey} onChange={(e: any) => setSortKey(e.target.value)}>
            <option value="addedAt_desc">Newest first</option>
            <option value="addedAt_asc">Oldest first</option>
            <option value="title_az">Title A–Z</option>
            <option value="artist_az">Artist A–Z</option>
            <option value="duration_desc">Longest first</option>
            <option value="duration_asc">Shortest first</option>
            <option value="status">By Status</option>
          </select>
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="card animate-slide-down" style={{ marginBottom: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', padding: '12px 14px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Artist</label>
            <select className="input" value={filterArtist} onChange={(e) => setFilterArtist(e.target.value)}>
              <option value="">All Artists</option>
              {artistOptions.map((a) => (
                <option key={a.key} value={a.key}>{a.displayName} ({a.count})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Format</label>
            <select className="input" value={filterFormat} onChange={(e) => setFilterFormat(e.target.value)}>
              <option value="">All Formats</option>
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="flac">FLAC</option>
              <option value="m4a">M4A</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Status</label>
            <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="ready">Ready</option>
              <option value="source_required">Source Required</option>
              <option value="failed">Failed</option>
            </select>
          </div>
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

      {/* Track list */}
      <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
        {items.length === 0 ? (
          <div className="empty-state">
            <Music size={48} className="empty-state-icon" />
            <div className="empty-state-title">Your Selection is Empty</div>
            <p>Search music or import local tracks to start preparing your collection for USB export.</p>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => onNavigate('search')}>
              Discover Tracks
            </button>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 16px' }}>
            <Search size={32} className="empty-state-icon" />
            <div className="empty-state-title" style={{ fontSize: '15px' }}>No matches for active filters</div>
            <button className="btn btn-secondary" style={{ marginTop: '10px', fontSize: '12px' }} onClick={clearFilters}>
              Clear All Filters
            </button>
          </div>
        ) : (
          displayItems.map((item) => {
            const isSelected = selectedIds.includes(item.id);

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
                    {item.duration > 0 && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {formatSec(item.duration)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Resolution Status & Format */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  {renderResolutionBadge(item)}

                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {item.outputFormat.toUpperCase()}
                  </span>
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

      {/* Sticky footer */}
      {items.length > 0 && (
        <div
          className="card"
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            backgroundColor: '#0c0c0c',
            borderTop: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={toggleSelectAll}>
              {displayItems.length > 0 && displayItems.every((i) => selectedIds.includes(i.id)) ? 'Deselect All' : `Select All (${displayItems.length})`}
            </button>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {resolutionStats.resolved} of {resolutionStats.total} tracks ready to convert
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-primary"
              disabled={availableToProcessIds.length === 0}
              onClick={() => {
                sessionStorage.setItem('processing_selection_ids', JSON.stringify(availableToProcessIds));
                onNavigate('process');
              }}
              style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Process {availableToProcessIds.length} Available <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Match Review Modal */}
      {reviewingMatchItem && reviewingMatchItem.resolvedMedia && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card animate-scale-up" style={{ maxWidth: '540px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HelpCircle size={18} style={{ color: 'var(--warning)' }} /> Review Audio Match
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setReviewingMatchItem(null)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              An authorized audio source was found with a confidence score of{' '}
              <strong style={{ color: 'var(--warning)' }}>{(reviewingMatchItem.resolvedMedia.confidence * 100).toFixed(0)}%</strong>. Please review the comparison before proceeding:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              {/* Requested YouTube info */}
              <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  YouTube Track
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
                  {reviewingMatchItem.title}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {reviewingMatchItem.artist}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Duration: {formatSec(reviewingMatchItem.duration)}
                </div>
              </div>

              {/* Matched Source info */}
              <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--success)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Matched Audio Source
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
                  {reviewingMatchItem.resolvedMedia.matchedTitle || 'Unknown Title'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {reviewingMatchItem.resolvedMedia.matchedArtist || 'Unknown Artist'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                  Duration: {formatSec(reviewingMatchItem.resolvedMedia.matchedDuration || 0)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={12} style={{ color: reviewingMatchItem.resolvedMedia.license?.verified ? 'var(--success)' : 'var(--warning)' }} />
                  {reviewingMatchItem.resolvedMedia.license?.name || 'Open License'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => handleRejectMatch(reviewingMatchItem.id)}>
                Reject Match
              </button>
              <button className="btn btn-primary" onClick={() => handleAcceptMatch(reviewingMatchItem.id)}>
                Accept Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editingItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <form className="card animate-scale-up" onSubmit={saveMetadataEdit} style={{ maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Edit Track Metadata</h2>
              <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setEditingItem(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Title</label>
                <input type="text" className="input" value={editingItem.title} onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })} required />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
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
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Track #</label>
                <input type="text" className="input" value={editingItem.trackNumber || ''} onChange={(e) => setEditingItem({ ...editingItem, trackNumber: e.target.value })} />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Output Format</label>
                <select className="input" value={editingItem.outputFormat} onChange={(e: any) => setEditingItem({ ...editingItem, outputFormat: e.target.value })}>
                  <option value="mp3">MP3</option>
                  <option value="wav">WAV</option>
                  <option value="flac">FLAC</option>
                  <option value="m4a">M4A</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Quality</label>
                <select className="input" value={editingItem.quality} onChange={(e: any) => setEditingItem({ ...editingItem, quality: e.target.value })} disabled={['wav', 'flac'].includes(editingItem.outputFormat)}>
                  <option value="128">128 kbps</option>
                  <option value="192">192 kbps</option>
                  <option value="256">256 kbps</option>
                  <option value="320">320 kbps</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Custom Cover Art</label>
                <input type="file" ref={coverInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleCoverSelect} />
                <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => coverInputRef.current?.click()}>
                  Choose Cover Image…
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingItem(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
