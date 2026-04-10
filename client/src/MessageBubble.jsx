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

  // ── Voice message renderer ─────────────────────────────────
  const VoicePlayer = () => (
    <div className="voice-player">
      <audio controls src={msg.voiceUrl} preload="none" />
      <span className="voice-duration">{formatDuration(msg.voiceDuration)}</span>
    </div>
  );

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
          {reactionsArr.map(([emoji, data]) => (
            <button
              key={emoji}
              className={`reaction-chip ${data.users?.includes(currentUser) ? 'reacted' : ''}`}
              onClick={() => handleReact(emoji)}
              title={data.users?.join(', ')}
            >
              {emoji} <span className="reaction-count">{data.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(secs) {
  if (!secs) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
