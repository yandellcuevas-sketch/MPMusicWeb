import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { CartItem } from '../db/database';
import { Folder, Trash2, Music, Play, HardDrive, Plus } from 'lucide-react';

interface PlaylistsTabProps {
  onNavigate: (tab: string) => void;
  onPlayPreview: (track: { id: string; title: string; artist: string; thumbnailUrl: string; previewUrl: string }) => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const PlaylistsTab: React.FC<PlaylistsTabProps> = ({ onNavigate, onPlayPreview, showToast }) => {
  const playlists = useLiveQuery(() => db.playlists.toArray()) || [];
  const cartItems = useLiveQuery(() => db.cart.toArray()) || [];
  
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      const id = `pl_${Math.random().toString(36).substring(7)}_${Date.now()}`;
      await db.playlists.put({
        id,
        name: newPlaylistName.trim(),
        createdAt: Date.now(),
        itemIds: []
      });
      showToast(`Playlist "${newPlaylistName}" created!`, 'success');
      setNewPlaylistName('');
      setActivePlaylistId(id);
    } catch (err) {
      showToast('Failed to create playlist.', 'error');
    }
  };

  const deletePlaylist = async (id: string, name: string) => {
    try {
      await db.playlists.delete(id);
      showToast(`Playlist "${name}" deleted.`, 'success');
      if (activePlaylistId === id) setActivePlaylistId(null);
    } catch (err) {
      showToast('Failed to delete playlist.', 'error');
    }
  };

  const removePlaylistItem = async (playlistId: string, itemId: string) => {
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;

    try {
      const newItemIds = pl.itemIds.filter(id => id !== itemId);
      await db.playlists.update(playlistId, { itemIds: newItemIds });
      showToast('Item removed from playlist.', 'info');
    } catch (err) {
      showToast('Failed to remove item.', 'error');
    }
  };

  // Find tracks matching active playlist references
  const activePlaylist = playlists.find(p => p.id === activePlaylistId);
  const playlistTracks = React.useMemo(() => {
    if (!activePlaylist) return [];
    return activePlaylist.itemIds
      .map(id => cartItems.find(item => item.id === id))
      .filter(Boolean) as CartItem[];
  }, [activePlaylist, cartItems]);

  const handlePlayPreviewOfCartItem = (item: CartItem) => {
    // Curated stream links are previewable, otherwise directUrl
    const previewUrl = item.sourceUrl || '';
    onPlayPreview({
      id: item.id,
      title: item.title,
      artist: item.artist,
      thumbnailUrl: item.thumbnailUrl || '',
      previewUrl
    });
  };

  const triggerUsbExportForPlaylist = () => {
    if (!activePlaylistId) return;
    // Store selected playlist in localStorage so the USB panel can pre-select it
    localStorage.setItem('selected_export_playlist_id', activePlaylistId);
    onNavigate('usb');
  };

  return (
    <div className="playlists-tab animate-fade-in" style={{ display: 'grid', gridTemplateColumns: activePlaylistId ? '260px 1fr' : '1fr', gap: '32px' }}>
      
      {/* Playlists Directory Sidebar */}
      <div>
        <h2 style={{ marginBottom: '16px' }}>My Playlists</h2>
        
        {/* Create Form */}
        <form onSubmit={handleCreatePlaylist} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <input
            type="text"
            className="input"
            placeholder="New playlist name..."
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary btn-icon-only" title="Create Playlist">
            <Plus size={16} />
          </button>
        </form>

        {/* Directory List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {playlists.length > 0 ? (
            playlists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => setActivePlaylistId(pl.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: activePlaylistId === pl.id ? 'var(--accent-muted)' : 'var(--bg-card)',
                  color: activePlaylistId === pl.id ? 'var(--accent)' : 'var(--text-primary)',
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: activePlaylistId === pl.id ? 'rgba(204, 255, 0, 0.2)' : 'var(--border-subtle)',
                  transition: 'var(--transition-fast)',
                }}
              >
                <Folder size={16} style={{ marginRight: '10px', flexShrink: 0 }} />
                <span style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexGrow: 1 }}>
                  {pl.name}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginRight: '8px' }}>
                  ({pl.itemIds.length})
                </span>
                
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePlaylist(pl.id, pl.name);
                  }}
                  title="Delete playlist"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No playlists found. Create one above!
            </div>
          )}
        </div>
      </div>

      {/* Playlist Content View */}
      {activePlaylist && (
        <div className="card animate-slide-up" style={{ display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', marginBottom: '20px' }}>
            <div>
              <h2 style={{ margin: 0 }}>{activePlaylist.name}</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {playlistTracks.length} tracks referenced
              </p>
            </div>
            
            {playlistTracks.length > 0 && (
              <button className="btn btn-primary" onClick={triggerUsbExportForPlaylist}>
                <HardDrive size={16} /> Export Playlist to USB
              </button>
            )}
          </div>

          {/* Track List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {playlistTracks.length > 0 ? (
              playlistTracks.map((track) => (
                <div
                  key={track.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-hover)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{ width: '36px', height: '36px', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'var(--bg-deep)', flexShrink: 0, marginRight: '12px' }}>
                    {track.thumbnailUrl ? (
                      <img src={track.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        <Music size={14} />
                      </div>
                    )}
                  </div>

                  <div style={{ flexGrow: 1, minWidth: 0, marginRight: '16px' }}>
                    <div style={{ fontWeight: '500', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {track.title}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {track.artist}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    {track.sourceUrl && (
                      <button
                        className="btn btn-secondary btn-icon-only"
                        style={{ width: '28px', height: '28px' }}
                        onClick={() => handlePlayPreviewOfCartItem(track)}
                        title="Preview track"
                      >
                        <Play size={12} />
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-icon-only"
                      style={{ width: '28px', height: '28px' }}
                      onClick={() => removePlaylistItem(activePlaylist.id, track.id)}
                      title="Remove from playlist"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Playlist is empty. Go to Cart / Selection, choose items, and add them to this playlist!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
