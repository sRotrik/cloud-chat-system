// ============================================================
// client/src/components/MessageBubble.jsx
// Renders one message with: reactions, read receipts, reply block
// ============================================================

import React, { useState, useRef } from 'react';
import './MessageBubble.css';

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageBubble({ msg, currentUser, onReact, onReply }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const holdTimer = useRef(null);

  const isOwn = msg.username === currentUser;

  // ── Long-press / right-click to show emoji picker ─────────
  const handleMouseDown = () => {
    holdTimer.current = setTimeout(() => setShowEmojiPicker(true), 500);
  };
  const handleMouseUp = () => clearTimeout(holdTimer.current);

  const handleReact = (emoji) => {
    onReact({ messageId: msg._id, emoji });
    setShowEmojiPicker(false);
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
      onContextMenu={(e) => { e.preventDefault(); setShowEmojiPicker(true); }}
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

      {/* ── Emoji Picker ─────────────────────────────────── */}
      {showEmojiPicker && (
        <div className="emoji-picker" onMouseLeave={() => setShowEmojiPicker(false)}>
          {EMOJI_LIST.map(e => (
            <button key={e} className="emoji-btn" onClick={() => handleReact(e)}>{e}</button>
          ))}
          <button
            className="reply-btn"
            onClick={() => { onReply(msg); setShowEmojiPicker(false); }}
            title="Reply"
          >↩</button>
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
