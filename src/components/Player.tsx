import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Music } from 'lucide-react';

interface PlayerProps {
  track: {
    id: string;
    title: string;
    artist: string;
    thumbnailUrl: string;
    previewUrl: string;
  } | null;
  isPlaying: boolean;
  onTogglePlay: (playing: boolean) => void;
}

export const Player: React.FC<PlayerProps> = ({ track, isPlaying, onTogglePlay }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Player state
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  // Sync play/pause state
  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => {
        onTogglePlay(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, track?.id]);

  // Sync track URL
  useEffect(() => {
    if (!audioRef.current || !track) return;
    
    // Stop current
    audioRef.current.pause();
    audioRef.current.src = track.previewUrl;
    audioRef.current.load();
    
    if (isPlaying) {
      audioRef.current.play().catch(() => {
        onTogglePlay(false);
      });
    }
  }, [track?.id]);

  // Sync volume settings
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted;
    }
  }, [volume, muted]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleAudioEnded = () => {
    onTogglePlay(false);
    setCurrentTime(0);
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const clickPercentage = clickX / width;
    
    audioRef.current.currentTime = clickPercentage * duration;
    setCurrentTime(audioRef.current.currentTime);
  };

  const toggleMute = () => {
    setMuted(!muted);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!track) return null;

  return (
    <div className="mini-player animate-slide-up">
      {/* Hidden audio tag handler */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
      />

      {/* Track Info */}
      <div className="player-info">
        {track.thumbnailUrl ? (
          <img src={track.thumbnailUrl} alt="" className="player-cover" />
        ) : (
          <div className="player-cover-fallback">
            <Music size={18} />
          </div>
        )}
        <div className="player-metadata">
          <div className="player-title">{track.title}</div>
          <div className="player-artist">{track.artist}</div>
        </div>
      </div>

      {/* Controls & Progress bar */}
      <div className="player-controls">
        <div className="player-buttons">
          <button 
            className="player-btn player-btn-main" 
            onClick={() => onTogglePlay(!isPlaying)}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </div>

        <div className="player-progress-container">
          <span className="player-time">{formatTime(currentTime)}</span>
          <div className="player-progress-bg" onClick={handleProgressBarClick}>
            <div className="player-progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="player-time">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume slider */}
      <div className="player-volume">
        <button className="player-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
          {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          className="volume-slider"
          value={muted ? 0 : volume}
          onChange={(e) => {
            setVolume(parseFloat(e.target.value));
            setMuted(false);
          }}
        />
      </div>
    </div>
  );
};
