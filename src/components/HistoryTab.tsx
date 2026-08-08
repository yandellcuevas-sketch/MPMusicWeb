import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { cartService } from '../services/cartService';
import { History, RotateCcw, Trash2, CheckCircle2, XCircle } from 'lucide-react';

interface HistoryTabProps {
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ showToast }) => {
  const history = useLiveQuery(() => db.history.toArray()) || [];

  const handleRecreateSelection = async () => {
    const successItems = history.filter((h) => h.status === 'success');
    if (successItems.length === 0) {
      showToast('No successfully processed items found in history.', 'info');
      return;
    }

    try {
      let count = 0;
      for (const item of successItems) {
        // Re-add to cart
        const exists = await db.cart.get(item.id.replace('hist_', ''));
        if (!exists) {
          await cartService.addToCart({
            id: item.id.replace('hist_', '').split('_')[0] || `recreate_${Math.random().toString(36).substring(7)}`,
            source: item.source,
            title: item.title,
            artist: item.artist,
            duration: 240, // fallback
            outputFormat: item.format,
            quality: item.quality
          });
          count++;
        }
      }
      showToast(`Added ${count} items back to Cart!`, 'success');
    } catch (err) {
      showToast('Failed to recreate selection.', 'error');
    }
  };

  const clearHistory = async () => {
    try {
      await db.history.clear();
      showToast('History logs cleared.', 'success');
    } catch (err) {
      showToast('Failed to clear history logs.', 'error');
    }
  };

  const sortedHistory = React.useMemo(() => {
    return [...history].sort((a, b) => b.processedAt - a.processedAt);
  }, [history]);

  return (
    <div className="history-tab animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1>Process Logs & History</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Track previously exported files, formats, and results.</p>
        </div>

        {history.length > 0 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={handleRecreateSelection}>
              <RotateCcw size={16} /> Recreate Selection
            </button>
            <button className="btn btn-danger" onClick={clearHistory}>
              <Trash2 size={16} /> Clear History
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="card" style={{ padding: '0', flexGrow: 1, overflowY: 'auto' }}>
        {sortedHistory.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sortedHistory.map((item, index) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  borderBottom: index < sortedHistory.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {item.status === 'success' ? (
                    <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  ) : (
                    <XCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                  )}
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{item.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.artist}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    {item.source}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                    {item.format.toUpperCase()} ({item.quality}k)
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(item.processedAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '80px' }}>
            <History size={48} className="empty-state-icon" />
            <div className="empty-state-title">No history logs found</div>
            <p>Exported tracks will appear here once successfully processed.</p>
          </div>
        )}
      </div>
    </div>
  );
};
