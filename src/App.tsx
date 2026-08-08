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
      case 'usb':
        return <UsbTab showToast={showToast} />;
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
      <Sidebar activeTab={activeTab} onNavigate={setActiveTab} />

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
