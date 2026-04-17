// ============================================================
// client/src/components/MessageBubble.jsx
// Renders one message with: reactions, read receipts, reply block
// ============================================================

import React, { useState, useRef } from 'react';
import './MessageBubble.css';
import VoicePlayer from './VoicePlayer';

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageBubble({ msg, currentUser, onReact, onReply, onDelete, onForward }) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const holdTimer = useRef(null);
  const touchStartRef = useRef(null);

  const handleTouchMove = (e) => {
    if (touchStartRef.current !== null) {
      const deltaX = e.touches[0].clientX - touchStartRef.current;
      if (deltaX > 0 && deltaX < 120) {
        setSwipeOffset(deltaX);
      }
    }
  };

  const isOwn = msg.username === currentUser || msg.from === currentUser;

  // ── Long-press / right-click to show context menu ─────────
  const handleMouseDown = (e) => {
    holdTimer.current = setTimeout(() => setShowContextMenu(true), 500);
    if (e && e.touches) touchStartRef.current = e.touches[0].clientX;
  };
  const handleMouseUp = () => {
    clearTimeout(holdTimer.current);
    if (swipeOffset > 80 && onReply) onReply(msg);
    setSwipeOffset(0);
    touchStartRef.current = null;
  };

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

  return (
    <div
      className={`bubble-wrapper ${isOwn ? 'own' : 'other'}`}
      style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeOffset ? 'none' : 'transform 0.2s', touchAction: 'pan-y' }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchMove={handleTouchMove}
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

        {msg.type === 'voice' ? <VoicePlayer msg={msg} isOwn={isOwn} /> : (
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
