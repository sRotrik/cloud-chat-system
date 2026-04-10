// ============================================================
// client/src/components/MessageBubble.jsx
// Renders one message with: reactions, read receipts, reply block
// ============================================================

import React, { useState, useRef } from 'react';
import './MessageBubble.css';

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageBubble({ msg, currentUser, onReact, onReply, onDelete, onForward }) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const holdTimer = useRef(null);

  const isOwn = msg.username === currentUser || msg.from === currentUser;

  // ── Long-press / right-click to show context menu ─────────
  const handleMouseDown = () => {
    holdTimer.current = setTimeout(() => setShowContextMenu(true), 500);
  };
  const handleMouseUp = () => clearTimeout(holdTimer.current);

  const handleReact = (emoji) => {
    if (onReact) onReact({ messageId: msg._id, emoji });
    setShowContextMenu(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.text || msg.message || '');
    setShowContextMenu(false);
  };

  // ── Read receipt tick rendering ────────────────────────────
  const ReadTick = () => {
    if (!isOwn) return null;
    const readCount = msg.readBy?.length || 0;
    if (readCount > 0) {
      return <span className="tick tick-read" title="Read">✓✓</span>;
    }
    if (msg.deliveredTo?.length > 0) {
      return <span className="tick tick-delivered" title="Delivered">✓✓</span>;
    }
    return <span className="tick tick-sent" title="Sent">✓</span>;
  };

  // ── Format timestamp ───────────────────────────────────────
  const time = new Date(msg.createdAt).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit'
  });

  // ── Render reactions bar ───────────────────────────────────
  const reactionsArr = msg.reactions
    ? Object.entries(msg.reactions).filter(([, v]) => v.count > 0)
    : [];

  const formatDuration = (secs) => {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // ── Voice message renderer ─────────────────────────────────
  const VoicePlayer = () => {
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
                backgroundColor: (i / 30) * 100 <= progress ? '#00a884' : ''
              }} />
            ))}
          </div>
          <div className="vp-meta">
            <span>{formatDuration(msg.voiceDuration)}</span>
          </div>
        </div>
        <div className="vp-avatar">
          <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${msg.username}`} alt="" />
        </div>
      </div>
    );
  };

  return (
    <div
      className={`bubble-wrapper ${isOwn ? 'own' : 'other'}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      onContextMenu={(e) => { e.preventDefault(); setShowContextMenu(true); }}
    >
      {/* ── Reply quote block ─────────────────────────────── */}
      {msg.replyTo && (
        <div className="reply-quote">
          <span className="reply-username">{msg.replyTo.username}</span>
          <span className="reply-text">
            {msg.replyTo.type === 'voice' ? '🎤 Voice message' : msg.replyTo.text}
          </span>
        </div>
      )}

      {/* ── Bubble ───────────────────────────────────────── */}
      <div className={`bubble ${isOwn ? 'bubble-own' : 'bubble-other'}`}>
        {!isOwn && <div className="bubble-username">{msg.username}</div>}

        {msg.type === 'voice' ? <VoicePlayer /> : (
          <div className="bubble-text">{msg.text}</div>
        )}

        <div className="bubble-meta">
          <span className="bubble-time">{time}</span>
          <ReadTick />
        </div>
      </div>

      {/* ── Context Menu ─────────────────────────────────── */}
      {showContextMenu && (
        <div className="context-menu" onMouseLeave={() => setShowContextMenu(false)}>
          <div className="emoji-row">
            {EMOJI_LIST.map(e => (
              <button key={e} className="emoji-btn" onClick={() => handleReact(e)}>{e}</button>
            ))}
          </div>
          <div className="menu-actions">
            <button className="menu-action-btn" onClick={() => { if(onReply) onReply(msg); setShowContextMenu(false); }}>↩ Reply</button>
            <button className="menu-action-btn" onClick={() => { if(onForward) onForward(msg); setShowContextMenu(false); }}>➡ Forward</button>
            <button className="menu-action-btn" onClick={handleCopy}>📋 Copy</button>
            {isOwn && <button className="menu-action-btn del-everyone" onClick={() => { if(onDelete) onDelete(msg._id, true); setShowContextMenu(false); }}>🗑 Delete for everyone</button>}
            <button className="menu-action-btn del-me" onClick={() => { if(onDelete) onDelete(msg._id, false); setShowContextMenu(false); }}>🗑 Delete for me</button>
          </div>
        </div>
      )}

      {/* ── Reactions Bar ─────────────────────────────────── */}
      {reactionsArr.length > 0 && (
        <div className="reactions-bar">
          {reactionsArr.map(([emoji, reaction]) => (
            <div key={emoji} className={`reaction-chip ${reaction.users?.includes(currentUser) ? 'reacted' : ''}`}
                 onClick={(e) => { e.stopPropagation(); handleReact(emoji); }}>
              <span>{emoji}</span>
              <span className="reaction-count">{reaction.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
