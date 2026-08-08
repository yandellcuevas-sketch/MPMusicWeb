import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Play, Music, FolderHeart, History, HardDrive } from 'lucide-react';

interface HomeTabProps {
  onNavigate: (tab: string) => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({ onNavigate }) => {
  const stats = useLiveQuery(async () => {
    const cartCount = await db.cart.count();
    const playlistCount = await db.playlists.count();
    const historyItems = await db.history.toArray();
    
    const successCount = historyItems.filter(h => h.status === 'success').length;
    const recentHistory = historyItems
      .sort((a, b) => b.processedAt - a.processedAt)
      .slice(0, 5);

    return {
      cartCount,
      playlistCount,
      successCount,
      recentHistory
    };
  });

  return (
    <div className="home-tab animate-fade-in">
      <div className="welcome-banner card mb-6" style={{ background: 'linear-gradient(135deg, #101010 0%, #171717 100%)', borderLeft: '4px solid var(--accent)' }}>
        <h1 style={{ marginBottom: '8px' }}>MPMusicWeb</h1>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
          Music Cart, Organizer, and direct USB Exporter. Organize, convert, and take your music catalog anywhere.
        </p>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ backgroundColor: 'var(--bg-hover)', padding: '12px', borderRadius: '8px', color: 'var(--accent)' }}>
            <Music size={24} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '700' }}>{stats?.cartCount ?? 0}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Tracks in Cart</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ backgroundColor: 'var(--bg-hover)', padding: '12px', borderRadius: '8px', color: 'var(--accent)' }}>
            <FolderHeart size={24} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '700' }}>{stats?.playlistCount ?? 0}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Playlists</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ backgroundColor: 'var(--bg-hover)', padding: '12px', borderRadius: '8px', color: 'var(--accent)' }}>
            <HardDrive size={24} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '700' }}>{stats?.successCount ?? 0}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Exported Files</div>
          </div>
        </div>
      </div>

      {/* Action Cards */}
      <h2 style={{ marginBottom: '16px' }}>Quick Actions</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div className="card cursor-pointer" onClick={() => onNavigate('search')} style={{ cursor: 'pointer' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)' }}>
            <Music size={18} /> Discover Music
          </h3>
          <p style={{ marginTop: '8px' }}>
            Search from YouTube API or browse curated NoCopyrightSounds electronic/synthwave tracks.
          </p>
        </div>

        <div className="card cursor-pointer" onClick={() => onNavigate('import')} style={{ cursor: 'pointer' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)' }}>
            <Play size={18} /> Import Local Files
          </h3>
          <p style={{ marginTop: '8px' }}>
            Drag and drop your local MP3, MP4, WAV, M4A, FLAC files to organize and convert them.
          </p>
        </div>

        <div className="card cursor-pointer" onClick={() => onNavigate('usb')} style={{ cursor: 'pointer' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)' }}>
            <HardDrive size={18} /> USB Export Desk
          </h3>
          <p style={{ marginTop: '8px' }}>
            Select a target USB folder, configure file sorting, and export directly using native API.
          </p>
        </div>
      </div>

      {/* Recent Activity */}
      <h2 style={{ marginBottom: '16px' }}>Recent Activity</h2>
      <div className="card" style={{ padding: '0' }}>
        {stats?.recentHistory && stats.recentHistory.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {stats.recentHistory.map((item, index) => (
              <div 
                key={item.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '14px 20px',
                  borderBottom: index < stats.recentHistory.length - 1 ? '1px solid var(--border-subtle)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <History size={16} style={{ color: item.status === 'success' ? 'var(--success)' : 'var(--danger)' }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{item.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.artist}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ 
                    fontSize: '11px', 
                    padding: '2px 8px', 
                    borderRadius: '4px',
                    backgroundColor: item.status === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: item.status === 'success' ? 'var(--success)' : 'var(--danger)'
                  }}>
                    {item.status === 'success' ? `Ready (${item.format.toUpperCase()})` : 'Failed'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(item.processedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No recent processing logs found.
          </div>
        )}
      </div>
    </div>
  );
};
