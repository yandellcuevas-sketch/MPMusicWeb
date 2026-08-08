import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { CartItem } from '../db/database';
import { queueProcessor, canProcessItem } from '../services/queueProcessor';
import { cartService } from '../services/cartService';
import { Loader2, Play, AlertCircle, CheckCircle, XCircle, Trash2, ShieldAlert, X, Upload, Info } from 'lucide-react';

interface ProcessTabProps {
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  selectedIds?: string[] | null;
  onClearSelection?: () => void;
}

export const ProcessTab: React.FC<ProcessTabProps> = ({
  showToast,
  selectedIds,
  onClearSelection,
}) => {
  const items = useLiveQuery(() => db.cart.orderBy('addedAt').toArray()) || [];
  const [concurrency, setConcurrency] = useState(2);

  // File attachment handler
  const [attachTargetId, setAttachTargetId] = useState<string | null>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

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

  // Filter selectedIds to only those that currently exist in the database
  const validSelectedIds = useMemo(() => {
    if (!selectedIds || selectedIds.length === 0) return null;
    const existingIdSet = new Set(items.map((i) => i.id));
    const filtered = selectedIds.filter((id) => existingIdSet.has(id));
    return filtered.length > 0 ? filtered : null;
  }, [items, selectedIds]);

  // Auto-exit scoped mode if all selected IDs no longer exist in the cart
  useEffect(() => {
    if (selectedIds && selectedIds.length > 0 && items.length > 0) {
      const existsAny = selectedIds.some((id) => items.some((i) => i.id === id));
      if (!existsAny && onClearSelection) {
        onClearSelection();
      }
    }
  }, [selectedIds, items, onClearSelection]);

  const isScoped = Boolean(validSelectedIds && validSelectedIds.length > 0);

  const displayItems = useMemo(() => {
    if (isScoped && validSelectedIds) {
      return items.filter((item) => validSelectedIds.includes(item.id));
    }
    return items;
  }, [items, isScoped, validSelectedIds]);

  // Divide into processable vs source required
  const processableItems = useMemo(
    () => displayItems.filter((item) => canProcessItem(item)),
    [displayItems]
  );
  const sourceRequiredItems = useMemo(
    () => displayItems.filter((item) => !canProcessItem(item)),
    [displayItems]
  );

  const startQueue = async () => {
    if (processableItems.length === 0) {
      showToast('No processable tracks in selection. Awaiting authorized audio resolution or attached files.', 'error');
      return;
    }

    showToast(
      isScoped
        ? `Starting processing for ${processableItems.length} processable tracks...`
        : `Starting processing queue for ${processableItems.length} tracks...`,
      'info'
    );

    // Prepare ONLY the processable items: reset failed/cancelled/pending to pending
    await db.transaction('rw', db.cart, async () => {
      for (const item of processableItems) {
        if (['failed', 'cancelled', 'pending'].includes(item.status)) {
          await db.cart.update(item.id, { status: 'pending', progress: 0, errorMessage: undefined });
        }
      }
    });

    const targetIds = processableItems.map((i) => i.id);
    await queueProcessor.startProcessing(targetIds);
  };

  const cancelQueue = async () => {
    await queueProcessor.cancelAll();
    showToast('Processing queue cancelled.', 'info');
  };

  const clearCompleted = async () => {
    const readyItems = displayItems.filter((i) => i.status === 'ready');
    for (const item of readyItems) {
      await db.cart.delete(item.id);
    }
    showToast(`Cleared ${readyItems.length} completed items.`, 'success');
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
        showToast(`Attached "${file.name}" to "${targetItem?.title || 'track'}". Ready for processing!`, 'success');
      } catch {
        showToast('Failed to attach source file.', 'error');
      } finally {
        setAttachTargetId(null);
      }
    }
  };

  // Queue progress aggregates
  const queueStats = useMemo(() => {
    const total = displayItems.length;
    const ready = displayItems.filter((i) => i.status === 'ready').length;
    const failed = displayItems.filter((i) => i.status === 'failed').length;
    const active = displayItems.filter((i) => ['preparing', 'processing', 'tagging'].includes(i.status)).length;
    
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
  }, [displayItems]);

  useEffect(() => {
    if (
      isScoped &&
      queueStats.total > 0 &&
      !queueStats.running &&
      queueStats.ready + queueStats.failed === queueStats.total
    ) {
      sessionStorage.removeItem('processing_selection_ids');
    }
  }, [isScoped, queueStats]);

  const getStatusIcon = (item: CartItem) => {
    if (!canProcessItem(item)) {
      return <AlertCircle size={18} style={{ color: 'var(--warning)' }} />;
    }

    switch (item.status) {
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
    if (!canProcessItem(item)) {
      return 'Audio match required';
    }

    switch (item.status) {
      case 'ready':
        return 'Ready';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      case 'preparing':
        return 'Downloading audio...';
      case 'processing':
        return `Converting ${item.progress ?? 0}%`;
      case 'tagging':
        return 'Tagging ID3...';
      default:
        return 'Ready to convert';
    }
  };

  return (
    <div className="process-tab animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Hidden file input for attaching source */}
      <input
        type="file"
        ref={attachInputRef}
        style={{ display: 'none' }}
        accept="audio/*,video/*,.mp3,.mp4,.wav,.flac,.m4a,.webm,.ogg"
        onChange={handleFileAttachChange}
      />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: '0' }}>Processing Center</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Transcode authorized audio streams and write tags client-side with FFmpeg.wasm.</p>
        </div>

        {displayItems.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
              <button
                className="btn btn-primary"
                onClick={startQueue}
                disabled={processableItems.length === 0}
                title={processableItems.length === 0 ? 'No processable tracks in selection' : 'Start conversion queue'}
              >
                <Play size={16} /> {isScoped ? `Process ${processableItems.length} Selected` : `Process ${processableItems.length} Available`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scoped Selection Banner */}
      {isScoped && (
        <div
          className="card animate-slide-down"
          style={{
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(204, 255, 0, 0.08)',
            borderColor: 'rgba(204, 255, 0, 0.3)',
            padding: '12px 18px',
          }}
        >
          <div>
            <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--accent)' }}>
              PROCESSING SELECTION ({displayItems.length} tracks)
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {processableItems.length} ready to process • {sourceRequiredItems.length} require source or review
            </div>
          </div>
          {onClearSelection && (
            <button
              className="btn btn-secondary"
              onClick={onClearSelection}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <X size={14} /> Exit selection
            </button>
          )}
        </div>
      )}

      {/* Source Required Info Banner */}
      {sourceRequiredItems.length > 0 && (
        <div
          className="card animate-slide-down"
          style={{
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            borderColor: 'rgba(245, 158, 11, 0.25)',
            padding: '10px 16px',
          }}
        >
          <Info size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            <strong>{sourceRequiredItems.length} track{sourceRequiredItems.length > 1 ? 's' : ''} require an authorized audio match or attached file</strong> before they can be converted.
            Go to <em>My Selection</em> to review matches or retry resolution.
          </div>
        </div>
      )}

      {/* General Progress Bar */}
      {displayItems.length > 0 && (
        <div className="card" style={{ marginBottom: '20px', backgroundColor: '#0c0c0c' }}>
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
        {displayItems.length > 0 ? (
          displayItems.map((item) => {
            const isProcessable = canProcessItem(item);

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '14px 18px',
                  borderRadius: '8px',
                  backgroundColor: !isProcessable ? 'rgba(245, 158, 11, 0.03)' : (isScoped ? 'rgba(204,255,0,0.03)' : 'var(--bg-card)'),
                  border: `1px solid ${!isProcessable ? 'rgba(245, 158, 11, 0.2)' : (isScoped ? 'rgba(204,255,0,0.18)' : 'var(--border-subtle)')}`,
                  transition: 'border-color 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {getStatusIcon(item)}
                  
                  <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {item.artist} • <span style={{ fontWeight: '500' }}>{item.outputFormat.toUpperCase()}</span>
                      {isProcessable && item.resolvedMedia && (
                        <span style={{ marginLeft: '8px', color: 'var(--success)', fontSize: '11px' }}>
                          • Matched via {item.resolvedMedia.provider} ({(item.resolvedMedia.confidence * 100).toFixed(0)}%)
                        </span>
                      )}
                      {!isProcessable && (
                        <span style={{ marginLeft: '8px', color: 'var(--warning)', fontSize: '11px' }}>
                          • Audio match pending / unavailable
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '500', color: isProcessable ? 'var(--text-secondary)' : 'var(--warning)' }}>
                      {getStatusLabel(item)}
                    </span>

                    {!isProcessable && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '12px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => triggerAttachFile(item.id)}
                        title="Attach local audio/video file"
                      >
                        <Upload size={12} /> Attach file
                      </button>
                    )}
                    
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
                {['processing', 'preparing', 'tagging'].includes(item.status) && (
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
            );
          })
        ) : (
          <div className="empty-state">
            <Loader2 size={48} className="empty-state-icon" />
            <div className="empty-state-title">
              {isScoped ? 'No matching tracks in selection' : 'No elements to process'}
            </div>
            <p>
              {isScoped
                ? 'All tracks in this selection may have been deleted or removed from the cart.'
                : 'Your cart is empty. Search or import some tracks to process them here.'}
            </p>
            {isScoped && onClearSelection && (
              <button className="btn btn-secondary" style={{ marginTop: '14px' }} onClick={onClearSelection}>
                Return to full queue
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
