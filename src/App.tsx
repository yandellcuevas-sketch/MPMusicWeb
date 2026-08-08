import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { HomeTab } from './components/HomeTab';
import { SearchTab } from './components/SearchTab';
import { ImportTab } from './components/ImportTab';
import { CartTab } from './components/CartTab';
import { ProcessTab } from './components/ProcessTab';
import { PlaylistsTab } from './components/PlaylistsTab';
import { UsbTab } from './components/UsbTab';
import { HistoryTab } from './components/HistoryTab';
import { SettingsTab } from './components/SettingsTab';
import { Player } from './components/Player';
import { ArtistsTab } from './components/ArtistsTab';
import { initializeSettings } from './db/database';

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'info' | 'error';
}

interface PreviewTrack {
  id: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  previewUrl: string;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  
  // Preview Player states
  const [playingTrack, setPlayingTrack] = useState<PreviewTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Preselected IDs passed from Artists tab for USB export
  const [usbPreselectedIds, setUsbPreselectedIds] = useState<string[] | undefined>(undefined);

  // Initialize Dexie default settings
  useEffect(() => {
    initializeSettings();
  }, []);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(7) + '_' + Date.now();
    setToasts((prev) => [...prev, { id, text, type }]);
    
    // Auto remove toasts after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  /** Navigate to a tab. Intercepts usb tab to pick up preselected IDs from localStorage. */
  const handleNavigate = (tab: string) => {
    if (tab === 'usb') {
      const raw = localStorage.getItem('usb_export_selected_ids');
      if (raw) {
        try { setUsbPreselectedIds(JSON.parse(raw)); } catch { setUsbPreselectedIds(undefined); }
        localStorage.removeItem('usb_export_selected_ids');
      } else {
        setUsbPreselectedIds(undefined);
      }
    }
    setActiveTab(tab);
  };

  const handlePlayPreview = (track: PreviewTrack) => {
    if (playingTrack?.id === track.id) {
      // Toggle play/pause if clicking same track
      setIsPlaying(!isPlaying);
    } else {
      setPlayingTrack(track);
      setIsPlaying(true);
    }
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'home':
        return <HomeTab onNavigate={setActiveTab} />;
      case 'search':
        return (
          <SearchTab
            onPlayPreview={handlePlayPreview}
            currentPlayingId={playingTrack?.id}
            isPlaying={isPlaying}
            showToast={showToast}
          />
        );
      case 'import':
        return <ImportTab showToast={showToast} />;
      case 'cart':
        return (
          <CartTab
            onNavigate={setActiveTab}
            onPlayPreview={handlePlayPreview}
            showToast={showToast}
          />
        );
      case 'process':
        return <ProcessTab showToast={showToast} />;
      case 'playlists':
        return (
          <PlaylistsTab
            onNavigate={setActiveTab}
            onPlayPreview={handlePlayPreview}
            showToast={showToast}
          />
        );
      case 'artists':
        return (
          <ArtistsTab
            onNavigate={setActiveTab}
            onPlayPreview={handlePlayPreview}
            showToast={showToast}
          />
        );
      case 'usb':
        return <UsbTab showToast={showToast} preselectedIds={usbPreselectedIds} />;
      case 'history':
        return <HistoryTab showToast={showToast} />;
      case 'settings':
        return <SettingsTab showToast={showToast} />;
      default:
        return <HomeTab onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="app-container">
      {/* Toast Alert Notifications Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" style={{
            borderLeftColor: toast.type === 'success' ? 'var(--success)' : toast.type === 'error' ? 'var(--danger)' : 'var(--accent)'
          }}>
            <span style={{ fontSize: '13px', fontWeight: '500' }}>{toast.text}</span>
          </div>
        ))}
      </div>

      {/* Main layout sidebar navigation */}
      <Sidebar activeTab={activeTab} onNavigate={handleNavigate} />

      {/* Main view container */}
      <div className="main-layout">
        <main className="main-content" style={{
          paddingBottom: playingTrack ? 'calc(var(--player-height) + 32px)' : '32px'
        }}>
          {renderActiveTab()}
        </main>

        {/* Persistent mini preview player */}
        <Player
          track={playingTrack}
          isPlaying={isPlaying}
          onTogglePlay={setIsPlaying}
        />
      </div>
    </div>
  );
};

export default App;
