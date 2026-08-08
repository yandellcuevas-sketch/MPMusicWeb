import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { usbService } from '../services/usbService';
import type { ExportProgress } from '../services/usbService';
import { mediaRegistry } from '../services/mediaAssetRegistry';
import { FolderOpen, AlertTriangle, ShieldCheck, Play, Loader2 } from 'lucide-react';

interface UsbTabProps {
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const UsbTab: React.FC<UsbTabProps> = ({ showToast }) => {
  const cartItems = useLiveQuery(() => db.cart.toArray()) || [];
  const playlists = useLiveQuery(() => db.playlists.toArray()) || [];

  // USB Picker and settings states
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [structure, setStructure] = useState<'flat' | 'artist' | 'album' | 'genre'>('flat');
  const [preset, setPreset] = useState<'universal' | 'car' | 'dj' | 'hq' | 'small' | 'custom'>('universal');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('all');
  
  // Progress states
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  // File system access support check
  const isSupported = 'showDirectoryPicker' in window;

  // Retrieve playlist pre-selection from playlists tab
  useEffect(() => {
    const plId = localStorage.getItem('selected_export_playlist_id');
    if (plId) {
      setSelectedPlaylistId(plId);
      localStorage.removeItem('selected_export_playlist_id');
    }
  }, []);

  const handleSelectFolder = async () => {
    if (!isSupported) {
      showToast('Directory Picker is not supported in this browser. Please use Chrome/Edge or download files individually.', 'error');
      return;
    }

    try {
      const handle = await (window as any).showDirectoryPicker();
      setDirHandle(handle);
      showToast(`Selected directory: "${handle.name}"`, 'success');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showToast('Failed to select directory.', 'error');
      }
    }
  };

  // Filter items matching active scopes (ready items only!)
  const filteredItems = React.useMemo(() => {
    // We only export ready files (completed conversions)
    const readyItems = cartItems.filter(item => item.status === 'ready');
    
    if (selectedPlaylistId === 'all') {
      return readyItems;
    }
    
    const targetPlaylist = playlists.find(p => p.id === selectedPlaylistId);
    if (!targetPlaylist) return [];
    
    return readyItems.filter(item => targetPlaylist.itemIds.includes(item.id));
  }, [selectedPlaylistId, cartItems, playlists]);

  const handleExport = async () => {
    if (!dirHandle) {
      showToast('Please select a target folder first.', 'error');
      return;
    }
    if (filteredItems.length === 0) {
      showToast('No processed tracks ready to export. Go to Processing Center first!', 'error');
      return;
    }

    setExporting(true);
    setProgress({
      totalCount: filteredItems.length,
      currentCount: 0,
      currentName: 'Initializing export...',
      progressPercentage: 0,
      speedMbps: 0,
      completed: false,
      errorCount: 0
    });

    try {
      await usbService.exportToFolder(
        filteredItems,
        dirHandle,
        { structure, preset },
        (prog) => {
          setProgress(prog);
        }
      );
      showToast('Export process finished successfully!', 'success');
    } catch (err: any) {
      showToast(`Export failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // Fallback download triggers sequential download links
  const handleSequentialDownload = () => {
    if (filteredItems.length === 0) return;
    showToast(`Downloading ${filteredItems.length} files sequentially...`, 'info');
    
    filteredItems.forEach((item, index) => {
      const blob = mediaRegistry.getProcessedBlob(item.id);
      if (blob) {
        setTimeout(() => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${item.artist} - ${item.title}.${item.outputFormat}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, index * 800); // Stagger download triggers to prevent browser freezing
      }
    });
  };

  return (
    <div className="usb-tab animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h1>USB Export Desk</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
        Write your processed audio library directly to a USB stick or local drive with automatic folder organization.
      </p>

      {/* Browser Support Check */}
      {!isSupported && (
        <div className="card" style={{ display: 'flex', gap: '16px', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.2)', marginBottom: '24px' }}>
          <AlertTriangle size={24} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <div>
            <h3 style={{ margin: 0, color: 'var(--danger)' }}>Browser compatibility warning</h3>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>
              Your browser does not support the File System Access API. Direct USB folder writing is disabled.
              Use <strong>Chrome, Edge or Opera</strong>, or use the <strong>Download items</strong> fallback below to save your files.
            </p>
          </div>
        </div>
      )}

      {/* Form Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* Selector Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center' }}>
          <h3>1. Select USB Target Folder</h3>
          {dirHandle ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: 'var(--bg-hover)', borderRadius: '8px' }}>
              <ShieldCheck size={20} style={{ color: 'var(--success)' }} />
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>SELECTED TARGET</div>
                <div style={{ fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {dirHandle.name}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', border: '1px dashed var(--border-focus)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No folder selected
            </div>
          )}
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%', padding: '12px' }}
            onClick={handleSelectFolder}
            disabled={!isSupported || exporting}
          >
            <FolderOpen size={16} /> Choose Folder...
          </button>
        </div>

        {/* Configuration Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3>2. Set Up Export Style</h3>
          
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Source selection</label>
            <select 
              className="input" 
              value={selectedPlaylistId} 
              onChange={(e) => setSelectedPlaylistId(e.target.value)}
              disabled={exporting}
            >
              <option value="all">All processed files ({cartItems.filter(i => i.status === 'ready').length})</option>
              {playlists.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.itemIds.filter(id => cartItems.find(i => i.id === id)?.status === 'ready').length} ready)</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Folder Structure</label>
            <select 
              className="input" 
              value={structure} 
              onChange={(e: any) => setStructure(e.target.value)}
              disabled={exporting}
            >
              <option value="flat">Flat (All together in target folder)</option>
              <option value="artist">By Artist (Artist/Song.mp3)</option>
              <option value="album">By Artist & Album (Artist/Album/Song.mp3)</option>
              <option value="genre">By Genre (Genre/Song.mp3)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Naming Preset</label>
            <select 
              className="input" 
              value={preset} 
              onChange={(e: any) => setPreset(e.target.value)}
              disabled={exporting}
            >
              <option value="universal">Universal (Standard character sanitization)</option>
              <option value="car">Car Stereo (Forces simple ASCII, cleans accents, short paths)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {preset === 'car' && (
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
            <strong>Car Stereo Preset enabled:</strong> Audio filenames will be stripped of Unicode accents (e.g. "Canción" to "Cancion") and restricted to standard English alphanumeric characters to ensure max compatibility with legacy radio systems.
          </p>
        </div>
      )}

      {/* Export Actions & progress */}
      <div className="card" style={{ marginTop: 'auto', backgroundColor: '#0c0c0c', borderLeft: '4px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700' }}>Ready to Copy: {filteredItems.length} tracks</div>
            <p style={{ fontSize: '13px' }}>Verify target settings and click export below.</p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {!isSupported && (
              <button 
                className="btn btn-secondary" 
                onClick={handleSequentialDownload}
                disabled={filteredItems.length === 0}
              >
                Download Items Fallback
              </button>
            )}
            
            <button 
              className="btn btn-primary" 
              style={{ padding: '12px 28px' }}
              onClick={handleExport}
              disabled={exporting || filteredItems.length === 0 || (!isSupported && !dirHandle)}
            >
              {exporting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Copying...
                </>
              ) : (
                <>
                  <Play size={16} /> Export to USB Folder
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress Display */}
        {progress && (
          <div className="animate-slide-up" style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{ fontWeight: '500' }}>Copying: {progress.currentName}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {progress.currentCount} / {progress.totalCount} ({progress.progressPercentage}%)
              </span>
            </div>
            
            <div style={{ height: '6px', backgroundColor: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
              <div 
                style={{ 
                  height: '100%', 
                  backgroundColor: 'var(--accent)', 
                  width: `${progress.progressPercentage}%`,
                  transition: 'width 0.2s ease'
                }} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span>Speed: {progress.speedMbps > 0 ? `${progress.speedMbps} MB/s` : '--'}</span>
              {progress.errorCount > 0 && <span style={{ color: 'var(--danger)' }}>Errors encountered: {progress.errorCount}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
