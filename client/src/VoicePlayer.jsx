import React, { useRef, useState } from 'react';

const formatDuration = (secs) => {
  if (!secs) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export default function VoicePlayer({ msg, isOwn }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const bars = msg.waveform?.length === 30 ? msg.waveform : Array(30).fill(2);

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    const dur = audioRef.current.duration || msg.voiceDuration || 1;
    setProgress((cur / dur) * 100);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const dur = audioRef.current.duration || msg.voiceDuration || 1;
    audioRef.current.currentTime = percent * dur;
    setProgress(percent * 100);
  };

  return (
    <div className="voice-player">
      <audio ref={audioRef} src={msg.voiceUrl} onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} preload="metadata" />
      <button className="vp-play-btn" onClick={togglePlay}>{isPlaying ? '⏸' : '▶'}</button>
      <div className="vp-center">
        <div className="vp-waveform" onClick={handleSeek}>
          {bars.map((h, i) => (
            <div key={i} className="vp-bar" style={{ 
              height: `${Math.max(10, Math.min(100, h * 10))}%`,
              backgroundColor: (i / 30) * 100 <= progress ? '#9d71ff' : undefined
            }} />
          ))}
        </div>
        <div className="vp-meta">
          <span>{formatDuration(msg.voiceDuration)}</span>
        </div>
      </div>
      <div className="vp-avatar">
        <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${msg.username || msg.from}`} alt="" />
      </div>
    </div>
  );
}
