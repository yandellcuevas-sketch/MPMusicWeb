import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Settings, Save, ShieldAlert, Cpu, HardDrive } from 'lucide-react';

interface SettingsTabProps {
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ showToast }) => {
  const currentSettings = useLiveQuery(() => db.settings.get('current'));

  // Local form states
  const [apiKey, setApiKey] = useState('');
  const [format, setFormat] = useState<'mp3' | 'wav' | 'flac' | 'm4a' | 'mp4'>('mp3');
  const [quality, setQuality] = useState<'128' | '192' | '256' | '320'>('320');
  const [preset, setPreset] = useState<'universal' | 'car' | 'dj' | 'hq' | 'small' | 'custom'>('universal');
  const [structure, setStructure] = useState<'flat' | 'artist' | 'album' | 'genre' | 'playlist'>('flat');
  const [concurrency, setConcurrency] = useState(2);

  // Storage info
  const [storageEstimate, setStorageEstimate] = useState<{ used: string; total: string; percent: number } | null>(null);

  // Load from DB
  useEffect(() => {
    if (currentSettings) {
      setApiKey(currentSettings.youtubeApiKey || '');
      setFormat(currentSettings.defaultOutputFormat);
      setQuality(currentSettings.defaultQuality);
      setPreset(currentSettings.defaultExportPreset);
      setStructure(currentSettings.defaultFolderStructure);
      setConcurrency(currentSettings.concurrencyLimit);
    }
  }, [currentSettings]);

  // Load storage estimates
  useEffect(() => {
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        const usedMB = est.usage ? Math.round(est.usage / 1024 / 1024) : 0;
        const totalMB = est.quota ? Math.round(est.quota / 1024 / 1024) : 0;
        const pct = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0;
        setStorageEstimate({
          used: `${usedMB} MB`,
          total: `${Math.round(totalMB / 1024)} GB`,
          percent: pct
        });
      });
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.settings.put({
        id: 'current',
        youtubeApiKey: apiKey.trim(),
        defaultOutputFormat: format,
        defaultQuality: quality,
        defaultExportPreset: preset,
        defaultFolderStructure: structure,
        concurrencyLimit: concurrency
      });
      showToast('Settings saved successfully.', 'success');
    } catch (err) {
      showToast('Failed to save settings.', 'error');
    }
  };

  const hasSharedArrayBuffer = 'SharedArrayBuffer' in window;

  return (
    <div className="settings-tab animate-fade-in">
      <h1>Settings & Configurations</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
        Configure external APIs, transcode preferences, and check client environment details.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px' }}>
        
        {/* Settings Form */}
        <form className="card" onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'fit-content' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Settings size={20} /> Preferences
          </h2>

          {/* API Key */}
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              YouTube Data API v3 Key
            </label>
            <input
              type="password"
              className="input"
              placeholder="Paste your Google API key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Used client-side for official YouTube searches. Your key is stored locally in IndexedDB and never sent to external servers.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Output Format */}
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Default Format
              </label>
              <select className="input" value={format} onChange={(e: any) => setFormat(e.target.value)}>
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
                <option value="flac">FLAC</option>
                <option value="m4a">M4A</option>
              </select>
            </div>

            {/* Quality */}
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Default Quality
              </label>
              <select 
                className="input" 
                value={quality} 
                onChange={(e: any) => setQuality(e.target.value)}
                disabled={['wav', 'flac'].includes(format)}
              >
                <option value="128">128 kbps (Light)</option>
                <option value="192">192 kbps (Standard)</option>
                <option value="256">256 kbps (Medium)</option>
                <option value="320">320 kbps (High Quality)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Export Preset */}
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Export Preset
              </label>
              <select className="input" value={preset} onChange={(e: any) => setPreset(e.target.value)}>
                <option value="universal">Universal</option>
                <option value="car">Car Stereo</option>
                <option value="dj">DJ Set</option>
                <option value="hq">High Quality</option>
                <option value="small">Small USB</option>
              </select>
            </div>

            {/* Structure */}
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Folder Tree
              </label>
              <select className="input" value={structure} onChange={(e: any) => setStructure(e.target.value)}>
                <option value="flat">Flat</option>
                <option value="artist">By Artist</option>
                <option value="album">By Artist & Album</option>
                <option value="genre">By Genre</option>
              </select>
            </div>
          </div>

          {/* Concurrency */}
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Concurrency Limit
            </label>
            <select className="input" value={concurrency} onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}>
              <option value="1">1 Active Task (Slow / Safe)</option>
              <option value="2">2 Active Tasks (Recommended)</option>
              <option value="3">3 Active Tasks (Fast / Heavy)</option>
              <option value="4">4 Active Tasks (Unstable on weak systems)</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
            <Save size={16} /> Save Configurations
          </button>
        </form>

        {/* Environment Diagnostics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* WebAssembly & SharedArrayBuffer diagnostics */}
          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Cpu size={18} /> Processing Environment
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span>SharedArrayBuffer compatibility:</span>
                <span style={{ 
                  fontWeight: '700', 
                  color: hasSharedArrayBuffer ? 'var(--success)' : 'var(--danger)',
                  backgroundColor: hasSharedArrayBuffer ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  {hasSharedArrayBuffer ? 'Enabled (Fast)' : 'Disabled'}
                </span>
              </div>
              
              {!hasSharedArrayBuffer && (
                <div style={{ 
                  padding: '10px 14px', 
                  backgroundColor: 'rgba(239, 68, 68, 0.05)', 
                  border: '1px solid rgba(239, 68, 68, 0.15)', 
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  gap: '8px'
                }}>
                  <ShieldAlert size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
                  <span>
                    Your environment lacks Cross-Origin isolation. Conversions with FFmpeg.wasm will be slower or disabled. Ensure the site is served with COOP/COEP headers.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sandboxed storage space diagnostics */}
          {storageEstimate && (
            <div className="card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <HardDrive size={18} /> Sandboxed Disk Quota
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Browser-allocated Storage used:</span>
                  <span style={{ fontWeight: '600' }}>{storageEstimate.used}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Maximum sandbox capacity:</span>
                  <span style={{ fontWeight: '600' }}>{storageEstimate.total}</span>
                </div>
                
                <div style={{ height: '4px', backgroundColor: 'var(--bg-hover)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                  <div 
                    style={{ 
                      height: '100%', 
                      backgroundColor: 'var(--accent)', 
                      width: `${storageEstimate.percent}%` 
                    }} 
                  />
                </div>
              </div>
            </div>
          )}

          {/* Privacy Disclaimer */}
          <div className="card" style={{ backgroundColor: 'rgba(204, 255, 0, 0.02)', borderColor: 'rgba(204, 255, 0, 0.1)' }}>
            <h3>Privacy Protocol</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              MPMusicWeb operates on a <strong>local-first privacy protocol</strong>. No media files, metadata tags, or API credentials are ever sent or processed on our servers. All transcoding, data mapping, and USB file operations occur strictly inside your sandboxed browser thread.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
