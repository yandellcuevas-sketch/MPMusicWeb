import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { usbService } from '../services/usbService';
import type { ExportProgress } from '../services/usbService';
import { downloadSequentially } from '../services/sequentialDownloadService';
import type { SequentialDownloadProgress } from '../services/sequentialDownloadService';
import { FolderOpen, AlertTriangle, ShieldCheck, Download, Loader2, Info, X } from 'lucide-react';

interface UsbTabProps {
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  /** When set, only export these specific item IDs (e.g. from Artists tab "Export Artist") */
  preselectedIds?: string[];
  onClearSelection?: () => void;
}

export const UsbTab: React.FC<UsbTabProps> = ({ showToast, preselectedIds, onClearSelection }) => {
  const cartItems = useLiveQuery(() => db.cart.toArray()) || [];
  const playlists = useLiveQuery(() => db.playlists.toArray()) || [];

  // USB Picker and settings states
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [structure, setStructure] = useState<'flat' | 'artist' | 'album' | 'genre'>('flat');
  const [preset, setPreset] = useState<'universal' | 'car' | 'dj' | 'hq' | 'small' | 'custom'>('universal');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('all');

  // Progress states — two modes: folder export vs sequential download
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [dlProgress, setDlProgress] = useState<SequentialDownloadProgress | null>(null);

  // Cancellation ref for sequential downloads
  const cancelRef = useRef({ cancelled: false });

  /** True only when the browser exposes File System Access API. */
  const supportsDirectoryPicker = 'showDirectoryPicker' in window;

  // Retrieve playlist pre-selection from playlists tab
  useEffect(() => {
    const plId = localStorage.getItem('selected_export_playlist_id');
    if (plId) {
      setSelectedPlaylistId(plId);
      localStorage.removeItem('selected_export_playlist_id');
    }
  }, []);

  const handleSelectFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      setDirHandle(handle);
      showToast(`Folder selected: "${handle.name}"`, 'success');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showToast('Failed to select folder.', 'error');
      }
    }
  };

  // --- Item filtering --------------------------------------------------------

  /** Items that are processed and ready. */
  const readyItems = React.useMemo(
    () => cartItems.filter((item) => item.status === 'ready'),
    [cartItems]
  );

  /**
   * Items to export — respects (in order of priority):
   * 1. preselectedIds prop (from Artists / external caller)
   * 2. playlist filter dropdown
   * 3. all ready items
   */
  const filteredItems = React.useMemo(() => {
    if (preselectedIds && preselectedIds.length > 0) {
      return readyItems.filter((item) => preselectedIds.includes(item.id));
    }
    if (selectedPlaylistId !== 'all') {
      const pl = playlists.find((p) => p.id === selectedPlaylistId);
      if (!pl) return [];
      return readyItems.filter((item) => pl.itemIds.includes(item.id));
    }
    return readyItems;
  }, [preselectedIds, selectedPlaylistId, readyItems, playlists]);

  // --- Folder export (Chrome / Edge) ----------------------------------------

  const handleFolderExport = async () => {
    if (!dirHandle) {
      showToast('Please select a target folder first.', 'error');
      return;
    }
    if (filteredItems.length === 0) {
      showToast('No processed tracks ready to export. Process them in the Queue first.', 'error');
      return;
    }

    setExporting(true);
    setProgress({
      totalCount: filteredItems.length,
      currentCount: 0,
      currentName: 'Initializing…',
      progressPercentage: 0,
      speedMbps: 0,
      completed: false,
      errorCount: 0,
    });

    try {
      await usbService.exportToFolder(filteredItems, dirHandle, { structure, preset }, (prog) => {
        setProgress(prog);
      });
      showToast('Export finished!', 'success');
    } catch (err: any) {
      showToast(`Export failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // --- Sequential downloads (Safari / Firefox fallback) ---------------------

  const handleSequentialDownload = async () => {
    if (filteredItems.length === 0) {
      showToast('No processed tracks ready to download.', 'error');
      return;
    }

    cancelRef.current = { cancelled: false };
    setExporting(true);
    setDlProgress(null);

    try {
      await downloadSequentially(filteredItems, {
        intervalMs: 700,
        cancelRef: cancelRef.current,
        onProgress: (prog) => setDlProgress(prog),
      });

      if (cancelRef.current.cancelled) {
        showToast('Downloads cancelled.', 'info');
      } else {
        showToast('All files downloaded!', 'success');
      }
    } catch (err: any) {
      showToast(`Download failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleCancelDownload = () => {
    cancelRef.current.cancelled = true;
    showToast('Cancelling downloads…', 'info');
  };

  // --- Render ---------------------------------------------------------------

  const activeProgress = supportsDirectoryPicker ? progress : dlProgress;
  const progressPercentage = activeProgress?.progressPercentage ?? 0;
  const progressName = supportsDirectoryPicker
    ? (progress?.currentName ?? '')
    : (dlProgress?.currentName ?? '');
  const progressCount = supportsDirectoryPicker
    ? `${progress?.currentCount ?? 0} / ${progress?.totalCount ?? 0}`
    : `${dlProgress?.currentCount ?? 0} / ${dlProgress?.totalCount ?? 0}`;

  return (
    <div className="usb-tab animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h1>
        {supportsDirectoryPicker ? 'USB / Folder Export' : 'Download Processed Files'}
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '28px' }}>
        {supportsDirectoryPicker
          ? 'Write processed audio files directly to a USB stick or local folder, with automatic folder organization.'
          : 'Your browser does not support direct folder writing. Files will be downloaded one by one to your browser\'s Downloads folder.'}
      </p>

      {/* Browser mode banner */}
      {!supportsDirectoryPicker ? (
        <div className="card" style={{ display: 'flex', gap: '14px', backgroundColor: 'rgba(245, 158, 11, 0.07)', borderColor: 'rgba(245, 158, 11, 0.25)', marginBottom: '24px' }}>
          <AlertTriangle size={22} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--warning)' }}>
              Safari / Firefox detected — sequential download mode
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              Your browser does not allow apps to write directly to a folder or USB drive.
              Clicking <strong>Download Selection</strong> below will trigger individual file downloads,
              one at a time, to your browser's configured <em>Downloads</em> folder.
              To write directly to a USB drive, use <strong>Chrome or Edge</strong>.
            </p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', gap: '14px', backgroundColor: 'rgba(16, 185, 129, 0.06)', borderColor: 'rgba(16, 185, 129, 0.2)', marginBottom: '24px', padding: '12px 16px' }}>
          <Info size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '2px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            <strong style={{ color: 'var(--success)' }}>Chrome / Edge:</strong> Direct folder write is available.
            Select a folder below (including a mounted USB drive) and files will be copied there directly.
          </p>
        </div>
      )}

      {/* Scoped export banner */}
      {preselectedIds && preselectedIds.length > 0 && (
        <div
          className="card animate-slide-down"
          style={{
            marginBottom: '20px',
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
              EXPORTING SELECTION ({filteredItems.length} ready tracks)
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Only tracks selected in the previous screen will be exported.
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

      {/* Config grid — only shown in folder-write mode */}
      {supportsDirectoryPicker && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          {/* Folder selector */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ margin: 0 }}>1. Target Folder</h3>
            {dirHandle ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', backgroundColor: 'var(--bg-hover)', borderRadius: '8px' }}>
                <ShieldCheck size={18} style={{ color: 'var(--success)' }} />
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Selected</div>
                  <div style={{ fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {dirHandle.name}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '14px', border: '1px dashed var(--border-focus)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No folder selected
              </div>
            )}
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleSelectFolder} disabled={exporting}>
              <FolderOpen size={15} /> Choose Folder…
            </button>
          </div>

          {/* Settings */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ margin: 0 }}>2. Export Settings</h3>

            {(!preselectedIds || preselectedIds.length === 0) && (
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Source</label>
                <select className="input" value={selectedPlaylistId} onChange={(e) => setSelectedPlaylistId(e.target.value)} disabled={exporting}>
                  <option value="all">All processed ({readyItems.length})</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.itemIds.filter((id) => readyItems.some((i) => i.id === id)).length} ready)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Folder Structure</label>
              <select className="input" value={structure} onChange={(e: any) => setStructure(e.target.value)} disabled={exporting}>
                <option value="flat">Flat — all files together</option>
                <option value="artist">By Artist — Artist/Song.mp3</option>
                <option value="album">By Artist & Album — Artist/Album/Song.mp3</option>
                <option value="genre">By Genre — Genre/Song.mp3</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Naming Preset</label>
              <select className="input" value={preset} onChange={(e: any) => setPreset(e.target.value)} disabled={exporting}>
                <option value="universal">Universal (standard sanitization)</option>
                <option value="car">Car Stereo (ASCII only, no accents, short names)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Car stereo warning */}
      {supportsDirectoryPicker && preset === 'car' && (
        <div className="card" style={{ padding: '10px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
            <strong>Car Stereo preset:</strong> Filenames will be stripped of Unicode accents (e.g. "Canción" → "Cancion") for maximum legacy radio compatibility.
          </p>
        </div>
      )}

      {/* Action footer */}
      <div className="card" style={{ marginTop: 'auto', backgroundColor: '#0c0c0c', borderLeft: '4px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700' }}>
              {filteredItems.length} track{filteredItems.length !== 1 ? 's' : ''} ready
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
              {supportsDirectoryPicker
                ? 'Chrome / Edge: direct folder write'
                : 'Safari / Firefox: sequential file downloads'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Cancel button for sequential downloads */}
            {exporting && !supportsDirectoryPicker && (
              <button className="btn btn-danger" onClick={handleCancelDownload} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <X size={14} /> Cancel
              </button>
            )}

            {supportsDirectoryPicker ? (
              <button
                className="btn btn-primary"
                style={{ padding: '12px 24px' }}
                onClick={handleFolderExport}
                disabled={exporting || filteredItems.length === 0 || !dirHandle}
              >
                {exporting ? (
                  <><Loader2 size={15} className="animate-spin" /> Copying…</>
                ) : (
                  <><FolderOpen size={15} /> Export to Folder</>
                )}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ padding: '12px 24px' }}
                onClick={handleSequentialDownload}
                disabled={exporting || filteredItems.length === 0}
              >
                {exporting ? (
                  <><Loader2 size={15} className="animate-spin" /> Downloading…</>
                ) : (
                  <><Download size={15} /> Download Selection</>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {activeProgress && (
          <div className="animate-slide-up" style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
              <span style={{ fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>
                {progressName}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                {progressCount} ({progressPercentage}%)
              </span>
            </div>

            <div style={{ height: '6px', backgroundColor: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ height: '100%', backgroundColor: 'var(--accent)', width: `${progressPercentage}%`, transition: 'width 0.2s ease' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
              {supportsDirectoryPicker && progress && (
                <span>Speed: {progress.speedMbps > 0 ? `${progress.speedMbps} MB/s` : '—'}</span>
              )}
              {!supportsDirectoryPicker && dlProgress && dlProgress.skippedCount > 0 && (
                <span style={{ color: 'var(--warning)' }}>
                  {dlProgress.skippedCount} skipped (not yet processed)
                </span>
              )}
              {activeProgress.errorCount > 0 && (
                <span style={{ color: 'var(--danger)' }}>
                  {activeProgress.errorCount} error{activeProgress.errorCount !== 1 ? 's' : ''}
                </span>
              )}
              {activeProgress.completed && !exporting && (
                <span style={{ color: 'var(--success)' }}>✓ Complete</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
