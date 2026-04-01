// ============================================================
// client/src/components/ReplyBar.jsx
// Shows quoted message above input — dismissible
// ============================================================

import React from 'react';
import './ReplyBar.css';

export default function ReplyBar({ replyTo, onCancel }) {
  if (!replyTo) return null;

  return (
    <div className="reply-bar">
      <div className="rb-indicator" />
      <div className="rb-content">
        <span className="rb-username">{replyTo.username}</span>
        <span className="rb-text">
          {replyTo.type === 'voice' ? '🎤 Voice message' : replyTo.text}
        </span>
      </div>
      <button className="rb-cancel" onClick={onCancel} title="Cancel reply">✕</button>
    </div>
  );
}
