// ============================================================
// client/src/components/Chat.jsx  —  COMPLETE INTEGRATION
// Wires: MessageBubble, VoiceRecorder, MessageSearch, ReplyBar
// All 5 features: Reactions, Read Receipts, Reply, Search, Voice
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import MessageBubble  from './MessageBubble';
import VoiceRecorder  from './VoiceRecorder';
import MessageSearch  from './MessageSearch';
import ReplyBar       from './ReplyBar';
import './Chat.css';

export default function Chat({ socket, room, username }) {
  const [messages,  setMessages]  = useState([]);
  const [text,      setText]      = useState('');
  const [replyTo,   setReplyTo]   = useState(null);   // message being replied to
  const [typing,    setTyping]    = useState([]);      // usernames typing
  const bottomRef   = useRef(null);
  const typingTimer = useRef(null);
  const msgRefs     = useRef({});                      // for jump-to from search

  // ── Socket listeners ────────────────────────────────────
  useEffect(() => {
    // History on join
    socket.on('messageHistory', (msgs) => setMessages(msgs));

    // New message
    socket.on('newMessage', (msg) => {
      setMessages(prev => [...prev, msg]);

      // Mark as read if window is focused
      if (document.hasFocus()) {
        socket.emit('markAsRead', { messageIds: [msg._id], username, room });
      }
    });

    // Read receipts update
    socket.on('messagesRead', ({ messageIds, readBy, readAt }) => {
      setMessages(prev => prev.map(m =>
        messageIds.includes(String(m._id))
          ? { ...m, readBy: [...(m.readBy || []), { username: readBy, readAt }], status: 'read' }
          : m
      ));
    });

    // Delivered update
    socket.on('messageDelivered', ({ messageId, deliveredTo }) => {
      setMessages(prev => prev.map(m =>
        String(m._id) === String(messageId)
          ? { ...m, deliveredTo, status: 'delivered' }
          : m
      ));
    });

    // Reaction update
    socket.on('reactionUpdated', ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m =>
        String(m._id) === String(messageId) ? { ...m, reactions } : m
      ));
    });

    // Typing indicators
    socket.on('userTyping',     ({ username: u }) => setTyping(t => [...new Set([...t, u])]));
    socket.on('userStopTyping', ({ username: u }) => setTyping(t => t.filter(x => x !== u)));

    return () => {
      ['messageHistory','newMessage','messagesRead','messageDelivered',
       'reactionUpdated','userTyping','userStopTyping'].forEach(e => socket.off(e));
    };
  }, [socket, room, username]);

  // ── Auto-scroll on new messages ─────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Mark all unread as read when tab gains focus ────────
  useEffect(() => {
    const markRead = () => {
      const unread = messages
        .filter(m => m.username !== username && !m.readBy?.some(r => r.username === username))
        .map(m => m._id);
      if (unread.length) socket.emit('markAsRead', { messageIds: unread, username, room });
    };
    window.addEventListener('focus', markRead);
    return () => window.removeEventListener('focus', markRead);
  }, [messages, socket, room, username]);

  // ── Typing indicator emit ────────────────────────────────
  const handleTyping = (e) => {
    setText(e.target.value);
    socket.emit('typing', { room, username });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('stopTyping', { room, username });
    }, 1500);
  };

  // ── Send text / reply ────────────────────────────────────
  const sendText = () => {
    if (!text.trim()) return;
    socket.emit('sendMessage', {
      room, username, text: text.trim(),
      replyTo: replyTo ? {
        messageId: replyTo._id,
        username:  replyTo.username,
        text:      replyTo.text?.slice(0, 80),
        type:      replyTo.type
      } : null
    });
    setText('');
    setReplyTo(null);
    socket.emit('stopTyping', { room, username });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  };

  // ── Send voice message ───────────────────────────────────
  const sendVoice = useCallback(({ voiceUrl, voiceDuration, waveform }) => {
    socket.emit('sendMessage', {
      room, username, text: '',
      type: 'voice', voiceUrl, voiceDuration, waveform,
      replyTo: replyTo ? { messageId: replyTo._id, username: replyTo.username, type: replyTo.type } : null
    });
    setReplyTo(null);
  }, [socket, room, username, replyTo]);

  // ── React to message ─────────────────────────────────────
  const handleReact = useCallback(({ messageId, emoji }) => {
    socket.emit('reactToMessage', { messageId, emoji, username, room });
  }, [socket, username, room]);

  // ── Jump to message from search ──────────────────────────
  const jumpToMessage = useCallback((id) => {
    const el = msgRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-flash');
      setTimeout(() => el.classList.remove('highlight-flash'), 1500);
    }
  }, []);

  // ── Typing indicator text ────────────────────────────────
  const typingText = typing.filter(u => u !== username).join(', ');

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <span className="chat-room-name"># {room}</span>
        <div className="chat-header-actions">
          <MessageSearch socket={socket} room={room} onJumpTo={jumpToMessage} />
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map(msg => (
          <div
            key={msg._id}
            ref={el => { if (el) msgRefs.current[msg._id] = el; }}
          >
            <MessageBubble
              msg={msg}
              currentUser={username}
              onReact={handleReact}
              onReply={setReplyTo}
            />
          </div>
        ))}

        {/* Typing indicator */}
        {typingText && (
          <div className="typing-indicator">
            <span>{typingText} {typing.length === 1 ? 'is' : 'are'} typing</span>
            <span className="typing-dots"><span/><span/><span/></span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Reply bar */}
      <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />

      {/* Input bar */}
      <div className="chat-input-bar">
        <VoiceRecorder
          room={room}
          username={username}
          onSend={sendVoice}
          onCancel={() => {}}
        />
        <textarea
          className="chat-input"
          placeholder="Type a message…"
          value={text}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          className="send-btn"
          onClick={sendText}
          disabled={!text.trim()}
        >➤</button>
      </div>
    </div>
  );
}
