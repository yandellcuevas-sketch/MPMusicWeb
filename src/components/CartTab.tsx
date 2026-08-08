import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { CartItem } from '../db/database';
import { cartService } from '../services/cartService';
import { mediaRegistry } from '../services/mediaAssetRegistry';
import { Trash2, Edit3, Music, CheckSquare, Square, Layers, ArrowRight, X, Play } from 'lucide-react';

interface CartTabProps {
  onNavigate: (tab: string) => void;
  onPlayPreview: (track: { id: string; title: string; artist: string; thumbnailUrl: string; previewUrl: string }) => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const CartTab: React.FC<CartTabProps> = ({ onNavigate, onPlayPreview, showToast }) => {
  const items = useLiveQuery(() => db.cart.orderBy('addedAt').toArray()) || [];
  const playlists = useLiveQuery(() => db.playlists.toArray()) || [];

  // UI Selection States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);

  // Bulk operation states
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [bulkFormat, setBulkFormat] = useState<'mp3' | 'wav' | 'flac' | 'm4a' | 'mp4'>('mp3');
  const [bulkQuality, setBulkQuality] = useState<'128' | '192' | '256' | '320'>('320');
  
  // Custom tag file input
  const coverInputRef = React.useRef<HTMLInputElement>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((x) => x.id));
    }
  };

  const deleteSelected = async () => {
    try {
      for (const id of selectedIds) {
        await cartService.removeFromCart(id);
      }
      showToast(`Removed ${selectedIds.length} items from selection`, 'success');
      setSelectedIds([]);
    } catch (err) {
      showToast('Failed to delete selected items.', 'error');
    }
  };

  const applyBulkSettings = async () => {
    if (selectedIds.length === 0) return;
    try {
      await db.transaction('rw', db.cart, async () => {
        for (const id of selectedIds) {
          await db.cart.update(id, {
            outputFormat: bulkFormat,
            quality: bulkQuality
          });
        }
      });
      showToast(`Applied settings to ${selectedIds.length} tracks.`, 'success');
      setShowBulkOptions(false);
    } catch (err) {
      showToast('Failed to apply bulk settings.', 'error');
    }
  };

  const applyPreset = async (presetName: 'universal' | 'car' | 'dj' | 'hq' | 'small') => {
    if (selectedIds.length === 0) return;
    try {
      await db.transaction('rw', db.cart, async () => {
        for (const id of selectedIds) {
          if (presetName === 'universal') {
            await db.cart.update(id, { outputFormat: 'mp3', quality: '192' });
          } else if (presetName === 'car') {
            await db.cart.update(id, { outputFormat: 'mp3', quality: '128' });
          } else if (presetName === 'dj') {
            await db.cart.update(id, { outputFormat: 'wav', quality: '320' });
          } else if (presetName === 'hq') {
            await db.cart.update(id, { outputFormat: 'flac', quality: '320' });
          } else if (presetName === 'small') {
            await db.cart.update(id, { outputFormat: 'mp3', quality: '128' });
          }
        }
      });
      showToast(`Applied "${presetName.toUpperCase()}" preset to selected items.`, 'success');
    } catch (err) {
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
        album: editingItem.album,
        year: editingItem.year,
        genre: editingItem.genre,
        trackNumber: editingItem.trackNumber,
        outputFormat: editingItem.outputFormat,
        quality: editingItem.quality
      });
      showToast('Metadata updated successfully.', 'success');
      setEditingItem(null);
    } catch (err) {
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
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;

    try {
      const newItemIds = [...pl.itemIds];
      for (const id of selectedIds) {
        if (!newItemIds.includes(id)) {
          newItemIds.push(id);
        }
      }
      await db.playlists.update(playlistId, { itemIds: newItemIds });
      showToast(`Added ${selectedIds.length} items to playlist "${pl.name}"`, 'success');
      setSelectedIds([]);
    } catch (err) {
      showToast('Failed to add items to playlist.', 'error');
    }
  };

  const startProcessingQueue = () => {
    onNavigate('process');
  };

  // Stats calculators
  const stats = React.useMemo(() => {
    const totalCount = items.length;
    const totalDurationSec = items.reduce((acc, item) => acc + (item.duration || 0), 0);
    
    // Estimate size in bytes
    const totalBytes = items.reduce((acc, item) => {
      let rate = 320; // Default kbps
      if (item.outputFormat === 'mp3' || item.outputFormat === 'm4a') {
        rate = parseInt(item.quality || '320', 10);
      }
      const duration = item.duration || 240; // fallback to 4 mins
      
      if (item.outputFormat === 'wav') {
        // PCM 16-bit 44.1kHz stereo
        return acc + duration * 176400; 
      }
      if (item.outputFormat === 'flac') {
        // FLAC approx 50% of wav
        return acc + duration * 88200;
      }
      // Bitrate in kilobits per sec -> bytes: (rate * 1000 * duration) / 8
      return acc + (rate * 1000 * duration) / 8;
    }, 0);

    const m = Math.floor(totalDurationSec / 60);
    const h = Math.floor(m / 60);
    const mRemaining = m % 60;
    
    const timeString = h > 0 ? `${h} h ${mRemaining} min` : `${m} min`;
    const sizeString = `${Math.round(totalBytes / 1024 / 1024)} MB`;

    return {
      totalCount,
      timeString,
      sizeString
    };
  }, [items]);

  const formatSec = (sec: number) => {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="cart-tab animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: '0' }}>My Selection</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Review configurations, edit metadata and set up presets.</p>
        </div>

        {items.length > 0 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={toggleSelectAll}>
              {selectedIds.length === items.length ? 'Deselect All' : 'Select All'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowBulkOptions(!showBulkOptions)}>
              <Layers size={16} /> Bulk Operations
            </button>
            <button className="btn btn-danger" onClick={deleteSelected} disabled={selectedIds.length === 0}>
              <Trash2 size={16} /> Delete Selected
            </button>
          </div>
        )}
      </div>

      {/* Bulk Operations Sub-panel */}
      {showBulkOptions && selectedIds.length > 0 && (
        <div className="card animate-slide-down" style={{ marginBottom: '24px', display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Format</label>
            <select className="input" style={{ width: '100px' }} value={bulkFormat} onChange={(e: any) => setBulkFormat(e.target.value)}>
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="flac">FLAC</option>
              <option value="m4a">M4A</option>
            </select>
          </div>
          {['mp3', 'm4a'].includes(bulkFormat) && (
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Quality (bitrate)</label>
              <select className="input" style={{ width: '100px' }} value={bulkQuality} onChange={(e: any) => setBulkQuality(e.target.value)}>
                <option value="128">128 kbps</option>
                <option value="192">192 kbps</option>
                <option value="256">256 kbps</option>
                <option value="320">320 kbps</option>
              </select>
            </div>
          )}
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Presets</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => applyPreset('universal')}>Universal</button>
              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => applyPreset('car')}>Car Stereo</button>
              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => applyPreset('dj')}>DJ WAV</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Add to Playlist</label>
            <select className="input" style={{ width: '140px' }} onChange={(e) => addToPlaylist(e.target.value)} defaultValue="">
              <option value="" disabled>Select Playlist</option>
              {playlists.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={applyBulkSettings}>
            Apply Changes
          </button>
        </div>
      )}

      {/* Main Music Queue List */}
      <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '32px' }}>
        {items.length > 0 ? (
          items.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const isYouTube = item.source === 'youtube';

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 18px',
                  borderRadius: '8px',
                  backgroundColor: isSelected ? 'var(--accent-muted)' : 'var(--bg-card)',
                  border: '1px solid',
                  borderColor: isSelected ? 'rgba(204, 255, 0, 0.3)' : 'var(--border-subtle)',
                  transition: 'var(--transition-fast)',
                }}
              >
                {/* Select Toggle Box */}
                <div style={{ cursor: 'pointer', marginRight: '16px', color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }} onClick={() => toggleSelect(item.id)}>
                  {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                </div>

                {/* Thumbnail */}
                <div style={{ position: 'relative', width: '48px', height: '48px', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'var(--bg-hover)', flexShrink: 0, marginRight: '16px' }}>
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                      <Music size={18} />
                    </div>
                  )}
                </div>

                {/* Info & Config */}
                <div style={{ flexGrow: 1, minWidth: 0, marginRight: '16px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.artist}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>•</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {formatSec(item.duration)}
                    </span>
                    
                    {/* Source badges */}
                    <span style={{ 
                      fontSize: '9px', 
                      fontWeight: '700',
                      padding: '1px 4px', 
                      borderRadius: '3px',
                      backgroundColor: isYouTube ? '#ff0000' : 'rgba(255,255,255,0.08)',
                      color: '#ffffff',
                      textTransform: 'uppercase'
                    }}>
                      {item.source}
                    </span>
                  </div>
                </div>

                {/* Format Settings & actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.outputFormat.toUpperCase()}</span>
                    {['mp3', 'm4a'].includes(item.outputFormat) && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>({item.quality}k)</span>
                    )}
                  </div>
                  
                  {isYouTube && (
                    <span style={{ 
                      fontSize: '10px', 
                      padding: '2px 6px', 
                      borderRadius: '4px',
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      color: 'var(--warning)',
                      border: '1px solid rgba(245, 158, 11, 0.2)'
                    }} title="Needs local file or authorized link to convert. Available for preview.">
                      Preview-Only
                    </span>
                  )}

                  <div style={{ display: 'flex', gap: '4px' }}>
                    {item.sourceUrl && (
                      <button
                        className="btn btn-secondary btn-icon-only"
                        onClick={() => onPlayPreview({
                          id: item.id,
                          title: item.title,
                          artist: item.artist,
                          thumbnailUrl: item.thumbnailUrl || '',
                          previewUrl: item.sourceUrl!
                        })}
                        title="Preview track"
                      >
                        <Play size={14} />
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-icon-only"
                      onClick={() => setEditingItem(item)}
                      title="Edit metadata"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      className="btn btn-secondary btn-icon-only"
                      onClick={() => cartService.removeFromCart(item.id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-state">
            <Music size={48} className="empty-state-icon" />
            <div className="empty-state-title">Your Cart is Empty</div>
            <p>Go to the Discover tab to search and add tracks here.</p>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => onNavigate('search')}>
              Browse Music
            </button>
          </div>
        )}
      </div>

      {/* Persistent Footer Stats & Process button */}
      {items.length > 0 && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            backgroundColor: '#0c0c0c',
            borderTop: '2px solid var(--accent-muted)',
            marginTop: 'auto',
          }}
        >
          <div style={{ display: 'flex', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>TOTAL ITEMS</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>{stats.totalCount}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>TOTAL DURATION</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>{stats.timeString}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>EST. OUTPUT SIZE</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent)' }}>~ {stats.sizeString}</div>
            </div>
          </div>

          <button className="btn btn-primary" style={{ padding: '12px 28px', fontSize: '15px' }} onClick={startProcessingQueue}>
            Process Queue <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Single Edit Metadata Modal Panel Drawer */}
      {editingItem && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <form className="card" onSubmit={saveMetadataEdit} style={{ maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Edit Metadata (ID3 Tags)</h2>
              <button 
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setEditingItem(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Title</label>
                <input 
                  type="text" 
                  className="input" 
                  value={editingItem.title} 
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Artist</label>
                <input 
                  type="text" 
                  className="input" 
                  value={editingItem.artist} 
                  onChange={(e) => setEditingItem({ ...editingItem, artist: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Album</label>
                <input 
                  type="text" 
                  className="input" 
                  value={editingItem.album || ''} 
                  onChange={(e) => setEditingItem({ ...editingItem, album: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Genre</label>
                <input 
                  type="text" 
                  className="input" 
                  value={editingItem.genre || ''} 
                  onChange={(e) => setEditingItem({ ...editingItem, genre: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Year</label>
                  <input 
                    type="text" 
                    className="input" 
                    value={editingItem.year || ''} 
                    onChange={(e) => setEditingItem({ ...editingItem, year: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Track #</label>
                  <input 
                    type="text" 
                    className="input" 
                    value={editingItem.trackNumber || ''} 
                    onChange={(e) => setEditingItem({ ...editingItem, trackNumber: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Format & Bitrate</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="input" 
                    value={editingItem.outputFormat} 
                    onChange={(e: any) => setEditingItem({ ...editingItem, outputFormat: e.target.value })}
                  >
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                    <option value="flac">FLAC</option>
                    <option value="m4a">M4A</option>
                  </select>
                  {['mp3', 'm4a'].includes(editingItem.outputFormat) && (
                    <select 
                      className="input" 
                      value={editingItem.quality} 
                      onChange={(e: any) => setEditingItem({ ...editingItem, quality: e.target.value })}
                    >
                      <option value="128">128 kbps</option>
                      <option value="192">192 kbps</option>
                      <option value="256">256 kbps</option>
                      <option value="320">320 kbps</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Cover Art selection */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Custom Cover Art (JPEG/PNG)</label>
                <input 
                  type="file" 
                  ref={coverInputRef} 
                  style={{ display: 'none' }} 
                  accept="image/*" 
                  onChange={handleCoverSelect} 
                />
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ width: '100%' }}
                  onClick={() => coverInputRef.current?.click()}
                >
                  Choose Image File...
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingItem(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Tags
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
