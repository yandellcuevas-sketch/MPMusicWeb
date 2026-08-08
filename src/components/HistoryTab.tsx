import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { cartService } from '../services/cartService';
import { getArtistSummary } from '../utils/artistUtils';
import { History, RotateCcw, Trash2, CheckCircle2, XCircle, Search, X } from 'lucide-react';

interface HistoryTabProps {
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ showToast }) => {
  const history = useLiveQuery(() => db.history.orderBy('processedAt').reverse().toArray()) || [];

  const [search, setSearch] = useState('');
  const [filterArtist, setFilterArtist] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFormat, setFilterFormat] = useState('');

  const artistOptions = useMemo(
    () => getArtistSummary(history.map((h) => ({ artist: h.artist, duration: 0 }))),
    [history]
  );

  const displayHistory = useMemo(() => {
    let result = [...history];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (h) => h.title.toLowerCase().includes(q) || h.artist.toLowerCase().includes(q)
      );
    }
    if (filterArtist) {
      result = result.filter(
        (h) => (h.artistNormalized || h.artist.toLowerCase().trim()) === filterArtist
      );
    }
    if (filterStatus) result = result.filter((h) => h.status === filterStatus);
    if (filterFormat) result = result.filter((h) => h.format === filterFormat);

    return result;
  }, [history, search, filterArtist, filterStatus, filterFormat]);

  const activeFilterCount = [search, filterArtist, filterStatus, filterFormat].filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setFilterArtist('');
    setFilterStatus('');
    setFilterFormat('');
  };

  const handleRecreateSelection = async () => {
    const successItems = displayHistory.filter((h) => h.status === 'success');
    if (successItems.length === 0) {
      showToast('No successful items in current view.', 'info');
      return;
    }

    try {
      let count = 0;
      for (const item of successItems) {
        const recreateId = `recreate_${Math.random().toString(36).substring(7)}_${Date.now()}`;
        await cartService.addToCart({
          id: recreateId,
          source: item.source,
          title: item.title,
          artist: item.artist,
          duration: 240, // fallback — history doesn't store duration
          outputFormat: item.format,
          quality: item.quality,
        });
        count++;
      }
      showToast(`Added ${count} items back to Cart!`, 'success');
    } catch {
      showToast('Failed to recreate selection.', 'error');
    }
  };

  const clearHistory = async () => {
    try {
      await db.history.clear();
      showToast('History cleared.', 'success');
    } catch {
      showToast('Failed to clear history.', 'error');
    }
  };

  return (
    <div className="history-tab animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0 }}>Process History</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {history.length} total entries
          </p>
        </div>
        {history.length > 0 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={handleRecreateSelection} title="Re-add filtered items to cart">
              <RotateCcw size={15} /> Recreate Selection
            </button>
            <button className="btn btn-danger" onClick={clearHistory}>
              <Trash2 size={15} /> Clear All
            </button>
          </div>
        )}
      </div>

      {/* Search + filters */}
      {history.length > 0 && (
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flexGrow: 1, minWidth: '180px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="input"
              placeholder="Search title or artist…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '30px' }}
            />
          </div>

          {/* Artist filter */}
          <select className="input" style={{ minWidth: '130px' }} value={filterArtist} onChange={(e) => setFilterArtist(e.target.value)}>
            <option value="">All Artists</option>
            {artistOptions.map((a) => (
              <option key={a.key} value={a.key}>{a.displayName} ({a.count})</option>
            ))}
          </select>

          {/* Status filter */}
          <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>

          {/* Format filter */}
          <select className="input" value={filterFormat} onChange={(e) => setFilterFormat(e.target.value)}>
            <option value="">All Formats</option>
            <option value="mp3">MP3</option>
            <option value="wav">WAV</option>
            <option value="flac">FLAC</option>
            <option value="m4a">M4A</option>
            <option value="mp4">MP4</option>
          </select>

          {activeFilterCount > 0 && (
            <button className="btn btn-secondary" onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <X size={12} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Results count when filtered */}
      {activeFilterCount > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          Showing {displayHistory.length} of {history.length} entries
        </div>
      )}

      {/* List */}
      <div className="card" style={{ padding: '0', flexGrow: 1, overflowY: 'auto' }}>
        {history.length === 0 ? (
          <div className="empty-state" style={{ padding: '80px' }}>
            <History size={48} className="empty-state-icon" />
            <div className="empty-state-title">No history yet</div>
            <p>Processed tracks will appear here with their result and format.</p>
          </div>
        ) : displayHistory.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px' }}>
            <Search size={36} className="empty-state-icon" />
            <div className="empty-state-title">No matches</div>
            <button className="btn btn-secondary" style={{ marginTop: '12px' }} onClick={clearFilters}>Clear Filters</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {displayHistory.map((item, index) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderBottom: index < displayHistory.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexGrow: 1 }}>
                  {item.status === 'success' ? (
                    <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  ) : (
                    <XCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{item.artist}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{item.source}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', fontFamily: 'var(--font-mono)' }}>
                    {item.format.toUpperCase()} {item.quality}k
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(item.processedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  {item.errorMessage && (
                    <span style={{ fontSize: '10px', color: 'var(--danger)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.errorMessage}>
                      {item.errorMessage}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
