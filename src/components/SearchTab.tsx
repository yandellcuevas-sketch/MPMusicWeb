import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { youtubeService } from '../services/youtubeService';
import type { SearchResult } from '../services/youtubeService';
import { cartService } from '../services/cartService';
import { Search, Plus, Play, Pause, Copy, Link, AlertTriangle, X, Check, Music } from 'lucide-react';

interface SearchTabProps {
  onPlayPreview: (track: { id: string; title: string; artist: string; thumbnailUrl: string; previewUrl: string }) => void;
  currentPlayingId?: string;
  isPlaying: boolean;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const SearchTab: React.FC<SearchTabProps> = ({
  onPlayPreview,
  currentPlayingId,
  isPlaying,
  showToast
}) => {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [directUrl, setDirectUrl] = useState('');
  const [resolvingUrl, setResolvingUrl] = useState(false);
  
  // Modal states for duplicate handling
  const [duplicateConflict, setDuplicateConflict] = useState<{
    pendingItem: SearchResult;
    duplicates: any[];
  } | null>(null);

  const settings = useLiveQuery(() => db.settings.get('current'));
  const cartItems = useLiveQuery(() => db.cart.toArray()) || [];

  // Search trigger on query/settings change with simple debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      triggerSearch(query);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [query, settings?.youtubeApiKey]);

  const triggerSearch = async (searchQuery: string) => {
    setLoading(true);
    try {
      const results = await youtubeService.search(searchQuery, settings?.youtubeApiKey);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
      showToast('Search query failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveUrl = async () => {
    if (!directUrl) return;
    setResolvingUrl(true);
    try {
      const resolved = await youtubeService.resolveUrl(directUrl, settings?.youtubeApiKey);
      if (resolved) {
        setSearchResults((prev) => [resolved, ...prev]);
        setDirectUrl('');
        showToast('Direct URL resolved successfully!', 'success');
      } else {
        showToast('Invalid or unsupported URL.', 'error');
      }
    } catch (err) {
      showToast('Failed to resolve URL.', 'error');
    } finally {
      setResolvingUrl(false);
    }
  };

  const checkAndAdd = async (track: SearchResult) => {
    try {
      const duplicates = await cartService.checkDuplicates(
        track.title,
        track.artist,
        track.duration,
        track.source === 'youtube' ? track.id : undefined
      );

      if (duplicates.length > 0) {
        setDuplicateConflict({ pendingItem: track, duplicates });
      } else {
        await executeAddToCart(track);
      }
    } catch (err) {
      showToast('Failed to add track to cart.', 'error');
    }
  };

  const executeAddToCart = async (track: SearchResult, renameSuffix?: string) => {
    const finalTitle = renameSuffix ? `${track.title} (${renameSuffix})` : track.title;
    
    await cartService.addToCart({
      id: track.id + (renameSuffix ? `_${Date.now()}` : ''),
      source: track.source,
      sourceId: track.source === 'youtube' ? track.id : undefined,
      sourceUrl: track.sourceUrl,
      title: finalTitle,
      artist: track.artist,
      thumbnailUrl: track.thumbnailUrl,
      duration: track.duration,
      outputFormat: 'mp3',
      quality: '320'
    });

    showToast(`"${finalTitle}" added to Cart`, 'success');
    setDuplicateConflict(null);
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard!', 'info');
  };

  const formatDuration = (sec: number) => {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isAlreadyInCart = (id: string) => {
    return cartItems.some(item => item.id === id || item.sourceId === id);
  };

  return (
    <div className="search-tab animate-fade-in">
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
        <h1 style={{ margin: '0', flexGrow: '1' }}>Discover Content</h1>
        
        {/* Direct Link Resolver Box */}
        <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '400px' }}>
          <input
            type="text"
            className="input"
            placeholder="Paste direct audio URL or YouTube link..."
            value={directUrl}
            onChange={(e) => setDirectUrl(e.target.value)}
            disabled={resolvingUrl}
          />
          <button className="btn btn-secondary" onClick={handleResolveUrl} disabled={resolvingUrl}>
            <Link size={16} /> {resolvingUrl ? 'Resolving...' : 'Resolve'}
          </button>
        </div>
      </div>

      {/* Main Search Bar */}
      <div style={{ position: 'relative', marginBottom: '32px' }}>
        <input
          type="text"
          className="input"
          style={{ paddingLeft: '44px', fontSize: '16px', height: '48px' }}
          placeholder="Search songs, artists or videos..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Search size={20} style={{ position: 'absolute', left: '16px', top: '14px', color: 'var(--text-muted)' }} />
      </div>

      {/* Search Status & Warning */}
      {!settings?.youtubeApiKey && (
        <div 
          className="card" 
          style={{ 
            padding: '12px 18px', 
            marginBottom: '24px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderColor: 'rgba(245, 158, 11, 0.2)'
          }}
        >
          <AlertTriangle size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            <strong>No YouTube API Key set.</strong> Operating in offline demo mode. Setup your API Key in settings to unlock global YouTube Searches.
          </p>
        </div>
      )}

      {/* Results Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card" style={{ height: '300px' }}>
              <div className="skeleton" style={{ height: '140px', borderRadius: '8px', marginBottom: '12px' }} />
              <div className="skeleton" style={{ height: '18px', width: '80%', marginBottom: '8px' }} />
              <div className="skeleton" style={{ height: '14px', width: '60%', marginBottom: '16px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <div className="skeleton" style={{ height: '36px', flexGrow: 1 }} />
                <div className="skeleton" style={{ height: '36px', width: '36px', borderRadius: '50%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : searchResults.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
          {searchResults.map((track) => {
            const inCart = isAlreadyInCart(track.id);
            const isCurrentPlaying = currentPlayingId === track.id;
            
            return (
              <div key={track.id} className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Cover Art Wrapper */}
                <div style={{ position: 'relative', width: '100%', paddingTop: '65%', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--bg-hover)', marginBottom: '12px' }}>
                  {track.thumbnailUrl ? (
                    <img
                      src={track.thumbnailUrl}
                      alt={track.title}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                      <Music size={32} />
                    </div>
                  )}
                  {track.duration > 0 && (
                    <div style={{ position: 'absolute', bottom: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                      {formatDuration(track.duration)}
                    </div>
                  )}
                  
                  <span style={{ 
                    position: 'absolute', 
                    top: '8px', 
                    left: '8px', 
                    fontSize: '10px', 
                    fontWeight: '700',
                    backgroundColor: track.source === 'youtube' ? '#ff0000' : 'var(--accent)',
                    color: track.source === 'youtube' ? '#ffffff' : 'var(--bg-deep)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    textTransform: 'uppercase'
                  }}>
                    {track.source}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flexGrow: 1, marginBottom: '16px', overflow: 'hidden' }}>
                  <div 
                    title={track.title} 
                    style={{ fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }}
                  >
                    {track.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {track.artist}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                  {track.previewUrl ? (
                    <button
                      className={`btn btn-secondary btn-icon-only`}
                      onClick={() => onPlayPreview({
                        id: track.id,
                        title: track.title,
                        artist: track.artist,
                        thumbnailUrl: track.thumbnailUrl,
                        previewUrl: track.previewUrl!
                      })}
                      title="Preview track"
                    >
                      {isCurrentPlaying && isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  ) : (
                    <div style={{ width: '36px' }} /> // Spacer
                  )}
                  
                  <button
                    className={`btn ${inCart ? 'btn-secondary' : 'btn-primary'}`}
                    style={{ flexGrow: 1 }}
                    onClick={() => checkAndAdd(track)}
                    disabled={inCart && track.source === 'youtube'}
                  >
                    {inCart ? (
                      <>
                        <Check size={14} /> Added
                      </>
                    ) : (
                      <>
                        <Plus size={14} /> Add
                      </>
                    )}
                  </button>

                  <button
                    className="btn btn-secondary btn-icon-only"
                    onClick={() => handleCopyLink(track.sourceUrl)}
                    title="Copy source URL"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Search size={48} className="empty-state-icon" />
          <div className="empty-state-title">No results found</div>
          <p>Try typing in another search query or check your settings.</p>
        </div>
      )}

      {/* Duplicate Conflict Resolution Drawer Modal */}
      {duplicateConflict && (
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
          <div className="card" style={{ maxWidth: '480px', width: '100%', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--warning)' }}>
                <AlertTriangle size={18} /> Duplicate Detected
              </h3>
              <button 
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setDuplicateConflict(null)}
              >
                <X size={18} />
              </button>
            </div>
            
            <p style={{ fontSize: '13px', marginBottom: '20px' }}>
              An item matching <strong>"{duplicateConflict.pendingItem.title}"</strong> is already in your cart. How would you like to proceed?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button 
                className="btn btn-primary" 
                style={{ justifyContent: 'flex-start' }}
                onClick={() => executeAddToCart(duplicateConflict.pendingItem, 'Copy')}
              >
                Keep both (Save as a copy)
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ justifyContent: 'flex-start' }}
                onClick={async () => {
                  // Replace
                  for (const dup of duplicateConflict.duplicates) {
                    await cartService.removeFromCart(dup.id);
                  }
                  await executeAddToCart(duplicateConflict.pendingItem);
                }}
              >
                Replace existing track in cart
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ justifyContent: 'flex-start' }}
                onClick={() => {
                  showToast('Omitted duplicates.', 'info');
                  setDuplicateConflict(null);
                }}
              >
                Omit and skip adding
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
