import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Music } from 'lucide-react';

export default function ProfileMusicPlayer({ src, username, accent = '#fff' }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [visible, setVisible] = useState(true);

  // Autoplay on mount
  useEffect(() => {
    if (!src || !audioRef.current) return;
    audioRef.current.volume = volume;
    audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    return () => {
      audioRef.current?.pause();
    };
  }, [src]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setProgress(audioRef.current.currentTime);
    setDuration(audioRef.current.duration || 0);
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = ratio * duration;
  };

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!src || !visible) return null;

  const progressPct = duration ? (progress / duration) * 100 : 0;

  return (
    <div className="pmp-wrap">
      <audio
        ref={audioRef}
        src={src}
        loop
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onEnded={() => setPlaying(false)}
      />

      <div className="pmp-card" style={{ '--pmp-accent': accent }}>
        {/* Left: icon + info */}
        <div className="pmp-left">
          <div className="pmp-icon" style={{ background: accent + '22', borderColor: accent + '44' }}>
            <Music size={14} style={{ color: accent }} className={playing ? 'pmp-spin' : ''} />
          </div>
          <div className="pmp-info">
            <span className="pmp-name">Музыка профиля</span>
            <span className="pmp-user" style={{ color: accent }}>@{username}</span>
          </div>
        </div>

        {/* Center: progress bar */}
        <div className="pmp-center">
          <span className="pmp-time">{fmt(progress)}</span>
          <div className="pmp-bar" onClick={handleSeek}>
            <div className="pmp-bar-fill" style={{ width: `${progressPct}%`, background: accent }} />
          </div>
          <span className="pmp-time">{fmt(duration)}</span>
        </div>

        {/* Right: controls */}
        <div className="pmp-right">
          <button className="pmp-btn" onClick={togglePlay} style={{ color: accent }}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="pmp-btn" onClick={() => setMuted(m => !m)}>
            {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input
            type="range" min={0} max={1} step={0.01}
            value={muted ? 0 : volume}
            onChange={e => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
            className="pmp-vol"
          />
          <button className="pmp-close" onClick={() => setVisible(false)}>×</button>
        </div>
      </div>
    </div>
  );
}
