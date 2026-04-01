// ============================================================
// client/src/components/MessageSearch.jsx
// Search bar inside a room — highlights matched text
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import './MessageSearch.css';

export default function MessageSearch({ socket, room, onJumpTo }) {
  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounce = useRef(null);

  // ── Open / close ─────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQuery(''); setResults([]); }
  }, [open]);

  // ── Listen for search results ─────────────────────────────
  useEffect(() => {
    socket.on('searchResults', ({ results: r }) => {
      setResults(r);
      setLoading(false);
    });
    return () => socket.off('searchResults');
  }, [socket]);

  // ── Debounced search emit ─────────────────────────────────
  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounce.current);
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    debounce.current = setTimeout(() => {
      socket.emit('searchMessages', { room, query: q.trim() });
    }, 400);
  };

  // ── Render highlighted text ───────────────────────────────
  const Highlight = ({ text, keyword }) => {
    if (!keyword) return <span>{text}</span>;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts   = text.split(new RegExp(`(${escaped})`, 'gi'));
    return (
      <span>
        {parts.map((p, i) =>
          p.toLowerCase() === keyword.toLowerCase()
            ? <mark key={i} className="search-mark">{p}</mark>
            : <span key={i}>{p}</span>
        )}
      </span>
    );
  };

  const formatTime = (d) => new Date(d).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  return (
    <>
      {/* Toggle button in chat header */}
      <button
        className="search-toggle"
        onClick={() => setOpen(o => !o)}
        title="Search messages"
      >🔍</button>

      {open && (
        <div className="search-panel">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              ref={inputRef}
              className="search-input"
              placeholder="Search messages…"
              value={query}
              onChange={handleChange}
            />
            {query && (
              <button className="search-clear" onClick={() => { setQuery(''); setResults([]); }}>✕</button>
            )}
          </div>

          <div className="search-results">
            {loading && <div className="search-status">Searching…</div>}

            {!loading && query.length >= 2 && results.length === 0 && (
              <div className="search-status">No messages found for "{query}"</div>
            )}

            {results.map(msg => (
              <div
                key={msg._id}
                className="search-result-item"
                onClick={() => { onJumpTo?.(msg._id); setOpen(false); }}
              >
                <div className="sri-header">
                  <span className="sri-username">{msg.username}</span>
                  <span className="sri-time">{formatTime(msg.createdAt)}</span>
                </div>
                <div className="sri-text">
                  <Highlight text={msg.text} keyword={query} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
