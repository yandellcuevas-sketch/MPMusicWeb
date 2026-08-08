import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { CartItem } from '../db/database';
import { queueProcessor } from '../services/queueProcessor';
import { Loader2, Play, AlertCircle, CheckCircle, XCircle, Trash2, ShieldAlert } from 'lucide-react';

interface ProcessTabProps {
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const ProcessTab: React.FC<ProcessTabProps> = ({ showToast }) => {
  const items = useLiveQuery(() => db.cart.orderBy('addedAt').toArray()) || [];
  const [concurrency, setConcurrency] = useState(2);

  // Sync settings concurrency
  useEffect(() => {
    const loadSettings = async () => {
      const settings = await db.settings.get('current');
      if (settings) {
        setConcurrency(settings.concurrencyLimit);
      }
    };
    loadSettings();
  }, []);

  const handleConcurrencyChange = async (val: number) => {
    setConcurrency(val);
    await db.settings.update('current', { concurrencyLimit: val });
    showToast(`Concurrency pool limited to ${val} tasks`, 'info');
  };

  const startQueue = async () => {
    showToast('Starting processing queue...', 'info');
    // Set all pending/failed/cancelled tasks back to pending
    await db.transaction('rw', db.cart, async () => {
      for (const item of items) {
        if (['failed', 'cancelled', 'pending'].includes(item.status)) {
          // If YouTube item has no direct URL, mark it as failed immediately or skip
          if (item.source === 'youtube' && !item.sourceUrl) {
            await db.cart.update(item.id, { status: 'failed', errorMessage: 'YouTube direct media downloads not supported natively. Link to a local file.' });
          } else {
            await db.cart.update(item.id, { status: 'pending', progress: 0, errorMessage: undefined });
          }
        }
      }
    });

    await queueProcessor.startProcessing();
  };

  const cancelQueue = async () => {
    await queueProcessor.cancelAll();
    showToast('Processing queue cancelled.', 'info');
  };

  const clearCompleted = async () => {
    // Delete items that are successfully ready (or delete their processed blobs only, but wait: 
    // we want to clear them from cart so they don't clutter!)
    const readyItems = items.filter(i => i.status === 'ready');
    for (const item of readyItems) {
      await db.cart.delete(item.id);
    }
    showToast(`Cleared ${readyItems.length} completed items.`, 'success');
  };

  // Queue progress aggregates
  const queueStats = React.useMemo(() => {
    const total = items.length;
    const ready = items.filter((i) => i.status === 'ready').length;
    const failed = items.filter((i) => i.status === 'failed').length;
    const active = items.filter((i) => ['preparing', 'processing', 'tagging'].includes(i.status)).length;
    
    const percentage = total > 0 ? Math.round((ready / total) * 100) : 0;
    const running = active > 0;

    return {
      total,
      ready,
      failed,
      active,
      percentage,
      running,
    };
  }, [items]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle size={18} style={{ color: 'var(--success)' }} />;
      case 'failed':
        return <XCircle size={18} style={{ color: 'var(--danger)' }} />;
      case 'cancelled':
        return <AlertCircle size={18} style={{ color: 'var(--text-muted)' }} />;
      case 'preparing':
      case 'processing':
      case 'tagging':
        return <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} />;
      default:
        return <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid var(--border-subtle)' }} />;
    }
  };

  const getStatusLabel = (item: CartItem) => {
    switch (item.status) {
      case 'ready':
        return 'Ready';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      case 'preparing':
        return 'Preparing source...';
      case 'processing':
        return `Converting ${item.progress ?? 0}%`;
      case 'tagging':
        return 'Tagging ID3...';
      default:
        return 'Waiting';
    }
  };

  return (
    <div className="process-tab animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: '0' }}>Processing Center</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Transcode audio files and write tags client-side using WebAssembly.</p>
        </div>

        {items.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Concurrency Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Max Parallel:</span>
              <select 
                className="input" 
                style={{ width: '60px', padding: '6px' }}
                value={concurrency}
                onChange={(e) => handleConcurrencyChange(parseInt(e.target.value, 10))}
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </div>

            <button className="btn btn-secondary" onClick={clearCompleted}>
              <Trash2 size={16} /> Clear Ready
            </button>
            
            {queueStats.running ? (
              <button className="btn btn-danger" onClick={cancelQueue}>
                Cancel All
              </button>
            ) : (
              <button className="btn btn-primary" onClick={startQueue} disabled={items.length === 0}>
                <Play size={16} /> Process Selection
              </button>
            )}
          </div>
        )}
      </div>

      {/* General Progress Bar */}
      {items.length > 0 && (
        <div className="card" style={{ marginBottom: '24px', backgroundColor: '#0c0c0c' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span>Conversion Progress</span>
            <span style={{ fontWeight: '700', color: 'var(--accent)' }}>
              {queueStats.ready} / {queueStats.total} ({queueStats.percentage}%)
            </span>
          </div>
          <div style={{ height: '8px', backgroundColor: 'var(--bg-hover)', borderRadius: '4px', overflow: 'hidden' }}>
            <div 
              style={{ 
                height: '100%', 
                backgroundColor: 'var(--accent)', 
                width: `${queueStats.percentage}%`,
                transition: 'width 0.3s ease'
              }} 
            />
          </div>
        </div>
      )}

      {/* Queue items list */}
      <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '14px 18px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {getStatusIcon(item.status)}
                
                <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {item.artist} • <span style={{ fontWeight: '500' }}>{item.outputFormat.toUpperCase()}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                    {getStatusLabel(item)}
                  </span>
                  
                  {['preparing', 'processing', 'tagging', 'pending'].includes(item.status) && (
                    <button 
                      className="btn btn-secondary btn-icon-only" 
                      onClick={() => queueProcessor.cancelTask(item.id)}
                      title="Cancel Task"
                    >
                      <XCircle size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress detail bar for active items */}
              {['processing', 'preparing'].includes(item.status) && (
                <div style={{ marginTop: '12px', height: '3px', backgroundColor: 'var(--bg-hover)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      height: '100%', 
                      backgroundColor: 'var(--accent)', 
                      width: `${item.progress ?? 0}%`,
                      transition: 'width 0.15s ease'
                    }} 
                  />
                </div>
              )}

              {/* Error explanation */}
              {item.status === 'failed' && item.errorMessage && (
                <div 
                  style={{ 
                    marginTop: '8px', 
                    padding: '8px 12px', 
                    backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: 'var(--danger)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <ShieldAlert size={14} style={{ flexShrink: 0 }} />
                  <span>{item.errorMessage}</span>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Loader2 size={48} className="empty-state-icon" />
            <div className="empty-state-title">No elements to process</div>
            <p>Your cart is empty. Search or import some tracks to process them here.</p>
          </div>
        )}
      </div>
    </div>
  );
};
