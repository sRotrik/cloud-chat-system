import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import MessageBubble from './MessageBubble';
import VoiceRecorder from './VoiceRecorder';
import VoicePlayer from './VoicePlayer';
import MessageSearch from './MessageSearch';
import ReplyBar from './ReplyBar';

const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';

const OnlineDot = ({ isOnline }) => (
  <span style={{
    position: 'absolute', bottom: '1px', right: '1px',
    width: '10px', height: '10px', borderRadius: '50%',
    background: isOnline ? '#00e5a0' : '#3a3a4a',
    border: '2px solid #0a0a0f',
    boxShadow: isOnline ? '0 0 6px #00e5a0' : 'none',
  }} />
);

const Avatar = ({ name, size = 40, gradient = false }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    background: gradient
      ? 'linear-gradient(135deg, #ff6b35, #f7931e)'
      : 'linear-gradient(135deg, #1a1a2e, #16213e)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: size * 0.38, fontWeight: '700',
    fontFamily: "'DM Sans', sans-serif",
    border: '1.5px solid rgba(255,255,255,0.08)',
    letterSpacing: '-0.02em',
  }}>
    {name?.charAt(0)?.toUpperCase()}
  </div>
);

function App() {
  const [screen, setScreen] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [room, setRoom] = useState('general');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [onlineUsersList, setOnlineUsersList] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [privateUser, setPrivateUser] = useState('');
  const [privateMessages, setPrivateMessages] = useState([]);
  const [privateTyping, setPrivateTyping] = useState('');
  const [privateMessage, setPrivateMessage] = useState('');
  const [conversations, setConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [notification, setNotification] = useState('');
  const [uploading, setUploading] = useState(false);
  const [privateUploading, setPrivateUploading] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const privateBottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const privateFileInputRef = useRef(null);
  const msgRefs = useRef({});

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUsername = localStorage.getItem('username');
    if (savedToken && savedUsername) {
      setToken(savedToken); setUsername(savedUsername); setScreen('home');
    }
    const params = new URLSearchParams(window.location.search);
    const googleToken = params.get('token');
    const googleUsername = params.get('username');
    if (googleToken && googleUsername) {
      localStorage.setItem('token', googleToken);
      localStorage.setItem('username', googleUsername);
      setToken(googleToken); setUsername(googleUsername); setScreen('home');
      window.history.replaceState({}, '', '/');
    }
    
    // Auto refresh the page every 3 minutes
    const autoRefreshTimer = setInterval(() => {
      window.location.reload();
    }, 3 * 60 * 1000);

    return () => clearInterval(autoRefreshTimer);
  }, []);

  useEffect(() => {
    if (username && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [username]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { privateBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [privateMessages]);

  const handleRegister = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${SERVER}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.user.username);
      setToken(data.token); setUsername(data.user.username); setScreen('home');
    } catch { setError('Registration failed. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleLogin = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${SERVER}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.user.username);
      setToken(data.token); setUsername(data.user.username); setScreen('home');
    } catch { setError('Login failed. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleGoogleLogin = () => { window.location.href = `${SERVER}/auth/google`; };

  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('username');
    setToken(''); setUsername(''); setMessages([]); setScreen('login');
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
  };

  const fetchConversations = async (uname) => {
    try {
      const res = await fetch(`${SERVER}/private/conversations/${uname}`);
      const data = await res.json();
      setConversations(data);
    } catch (err) { console.log('Error:', err); }
  };

  const cleanupConversations = async (uname) => {
    try {
      await fetch(`${SERVER}/private/conversations/cleanup/${uname}`, { method: 'DELETE' });
      fetchConversations(uname);
    } catch (err) { console.log('Cleanup error:', err); }
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.trim().length < 1) { setSearchResults([]); return; }
    try {
      const res = await fetch(`${SERVER}/private/search/${query}`);
      const data = await res.json();
      setSearchResults(data);
    } catch (err) { console.log('Search error:', err); }
  };

  const sendBrowserNotification = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  const initSocket = (uname) => {
    if (socketRef.current?.connected) return socketRef.current;
    const socket = io(SERVER, { auth: { token }, reconnection: true });
    socketRef.current = socket;
    socket.on('connect', () => { setConnected(true); socket.emit('register_user', uname); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('online_count', (count) => setOnlineUsers(count));
    socket.on('online_users_list', (list) => setOnlineUsersList(list));

    // Old format messages
    socket.on('message_history', (history) => setMessages(history));
    socket.on('receive_message', (msg) => setMessages(prev => [...prev, msg]));

    // NEW format messages (reactions, read receipts, reply, voice)
    socket.on('messageHistory', (history) => setMessages(history));
    socket.on('newMessage', (msg) => {
      setMessages(prev => [...prev, msg]);
      if (document.hasFocus()) {
        socket.emit('markAsRead', { messageIds: [msg._id], username: uname, room });
      }
    });
    socket.on('reactionUpdated', ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m =>
        String(m._id) === String(messageId) ? { ...m, reactions } : m
      ));
    });
    socket.on('messagesRead', ({ messageIds, readBy, readAt }) => {
      setMessages(prev => prev.map(m =>
        messageIds.includes(String(m._id))
          ? { ...m, readBy: [...(m.readBy || []), { username: readBy, readAt }], status: 'read' }
          : m
      ));
    });
    socket.on('messageDelivered', ({ messageId, deliveredTo }) => {
      setMessages(prev => prev.map(m =>
        String(m._id) === String(messageId)
          ? { ...m, deliveredTo, status: 'delivered' }
          : m
      ));
    });
    socket.on('messageDeleted', ({ messageId, forEveryone }) => {
      if (forEveryone) {
        setMessages(prev => prev.filter(m => String(m._id) !== String(messageId)));
        setPrivateMessages(prev => prev.filter(m => String(m._id) !== String(messageId)));
      }
    });

    socket.on('user_typing', (user) => { setTyping(`${user} is typing`); setTimeout(() => setTyping(''), 2000); });
    socket.on('private_history', (history) => setPrivateMessages(history));
    socket.on('receive_private', (msg) => {
      setPrivateMessages(prev => {
        if (msg.from === uname) { return [...prev.filter(m => !m.temp), msg]; }
        // If window focused and we're viewing this conversation, auto-mark as read
        if (document.hasFocus()) {
          socket.emit('mark_read', { from: uname, to: msg.from });
          return [...prev, { ...msg, readBy: [uname] }];
        }
        return [...prev, msg];
      });
      fetchConversations(uname);
    });
    socket.on('refresh_conversations', () => fetchConversations(uname));
    socket.on('private_user_typing', (user) => { setPrivateTyping(`${user} is typing`); setTimeout(() => setPrivateTyping(''), 2000); });
    socket.on('private_notification', ({ from }) => {
      setNotification(`New message from ${from}`);
      setTimeout(() => setNotification(''), 6000);
      fetchConversations(uname);
      sendBrowserNotification('CloudChat', `Encrypted message from ${from}`);
    });
    socket.on('messages_expiry_updated', ({ newExpiry }) => {
      setPrivateMessages(prev => prev.map(m => ({ ...m, expiresAt: newExpiry })));
    });
    const cleanupInterval = setInterval(() => cleanupConversations(uname), 30000);
    socket.on('disconnect', () => clearInterval(cleanupInterval));
    return socket;
  };

  const joinGroupChat = () => {
    const socket = initSocket(username);
    socket.emit('join_room', room);
    fetchConversations(username);
    setScreen('chat');
  };

  const openPrivateChat = (targetUser) => {
    const socket = initSocket(username);
    setPrivateUser(targetUser); setPrivateMessages([]);
    socket.emit('join_private', { from: username, to: targetUser });
    socket.emit('mark_read', { from: username, to: targetUser });
    setPrivateMessages(prev => prev.map(m =>
      m.from === targetUser ? { ...m, read: true } : m
    ));
    // Optimistically mark all received messages as read
    setPrivateMessages(prev => prev.map(m =>
      m.from === targetUser ? { ...m, readBy: [username] } : m
    ));
    setSearchQuery(''); setSearchResults([]);
    setScreen('private');
    setTimeout(() => fetchConversations(username), 500);
  };



  const sendMessageWithReply = () => {
    if (message.trim() && socketRef.current) {
      socketRef.current.emit('sendMessage', {
        room, username, text: message.trim(),
        replyTo: replyTo ? {
          messageId: replyTo._id,
          username: replyTo.username,
          text: (replyTo.text || replyTo.message)?.slice(0, 80),
          type: replyTo.type
        } : null
      });
      setMessage('');
      setReplyTo(null);
    }
  };

  const handleDeleteMessage = useCallback((messageId, forEveryone, isPrivateMsg = false, privUser = '') => {
    if (!forEveryone) {
      setMessages(prev => prev.filter(m => String(m._id) !== String(messageId)));
      setPrivateMessages(prev => prev.filter(m => String(m._id) !== String(messageId)));
      return;
    }
    if (socketRef.current) {
      const privateRoomId = isPrivateMsg ? [username, privUser].sort().join('_') : null;
      socketRef.current.emit('deleteMessage', { messageId, room, username, forEveryone, isPrivate: isPrivateMsg, privateRoomId });
    }
  }, [room, username]);

  const handleForwardMessage = useCallback((msg) => {
    setMessage(`[Forwarded]\n${msg.text || msg.message || 'Voice/Media file'}`);
  }, []);

  const handleReact = useCallback(({ messageId, emoji }) => {
    if (socketRef.current) {
      socketRef.current.emit('reactToMessage', { messageId, emoji, username, room });
    }
  }, [username, room]);

  const sendVoice = useCallback(({ voiceUrl, voiceDuration, waveform }) => {
    if (socketRef.current) {
      socketRef.current.emit('sendMessage', {
        room, username, text: '',
        type: 'voice', voiceUrl, voiceDuration, waveform,
        replyTo: replyTo ? {
          messageId: replyTo._id,
          username: replyTo.username,
          type: replyTo.type
        } : null
      });
      setReplyTo(null);
    }
  }, [room, username, replyTo]);

  const sendPrivateVoice = useCallback(({ voiceUrl, voiceDuration, waveform }) => {
    if (socketRef.current) {
      const payload = {
        message: '', type: 'voice', voiceUrl, voiceDuration, waveform
      };
      setPrivateMessages(prev => [...prev, {
        from: username, to: privateUser, ...payload,
        timestamp: new Date(), expiresAt: new Date(Date.now() + 5 * 60 * 1000), temp: true
      }]);
      socketRef.current.emit('send_private', { from: username, to: privateUser, ...payload });
      setTimeout(() => fetchConversations(username), 1000);
    }
  }, [username, privateUser]);

  const jumpToMessage = useCallback((id) => {
    const el = msgRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.background = 'rgba(255,107,53,0.2)';
      setTimeout(() => { el.style.background = ''; }, 1500);
    }
  }, []);

  const sendPrivateMessage = () => {
    if (privateMessage.trim() && socketRef.current) {
      const msgText = privateMessage;
      const rTo = replyTo ? {
          messageId: replyTo._id,
          username: replyTo.username || replyTo.from,
          text: (replyTo.text || replyTo.message)?.slice(0, 80),
          type: replyTo.type
        } : null;
      setPrivateMessages(prev => [...prev, {
        from: username, to: privateUser, message: msgText, replyTo: rTo,
        timestamp: new Date(), expiresAt: new Date(Date.now() + 5 * 60 * 1000), temp: true,
      }]);
      setPrivateMessage('');
      setReplyTo(null);
      socketRef.current.emit('send_private', { from: username, to: privateUser, message: msgText, replyTo: rTo });
      setTimeout(() => fetchConversations(username), 1000);
    }
  };

  const handleTyping = (e) => {
    setMessage(e.target.value);
    if (socketRef.current) socketRef.current.emit('typing', { room, username });
  };

  const handlePrivateTyping = (e) => {
    setPrivateMessage(e.target.value);
    if (socketRef.current) socketRef.current.emit('private_typing', { from: username, to: privateUser });
  };

  const handleFileUpload = async (e, isPrivate = false) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('File size must be under 10MB'); return; }
    isPrivate ? setPrivateUploading(true) : setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('username', username);
      formData.append('room', isPrivate ? `private_${username}_${privateUser}` : room);
      const res = await fetch(`${SERVER}/media/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      const payload = {
        message: `📎 ${data.originalName}`,
        fileUrl: `${SERVER}/media/file/${data.fileId}`,
        mimetype: data.mimetype, originalName: data.originalName,
      };
      if (isPrivate) {
        setPrivateMessages(prev => [...prev, { from: username, to: privateUser, ...payload, timestamp: new Date(), expiresAt: new Date(Date.now() + 5 * 60 * 1000), temp: true }]);
        socketRef.current.emit('send_private', { from: username, to: privateUser, ...payload });
      } else {
        socketRef.current.emit('send_message', { room, username, fileId: data.fileId, ...payload });
      }
    } catch (err) { alert('Upload failed: ' + err.message); }
    finally { isPrivate ? setPrivateUploading(false) : setUploading(false); e.target.value = ''; }
  };

  const leaveRoom = () => {
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    setMessages([]); setScreen('home');
  };

  const renderMedia = (msg) => {
    if (!msg.fileUrl) return null;
    const mime = msg.mimetype || '';
    if (mime.startsWith('image/')) return <img src={msg.fileUrl} alt={msg.originalName} style={s.mediaImage} onClick={() => window.open(msg.fileUrl, '_blank')} />;
    if (mime.startsWith('video/')) return <video controls style={s.mediaVideo}><source src={msg.fileUrl} type={mime} /></video>;
    if (mime.startsWith('audio/')) return <audio controls style={s.mediaAudio}><source src={msg.fileUrl} type={mime} /></audio>;
    return <a href={msg.fileUrl} target="_blank" rel="noreferrer" style={s.fileLink}>📎 {msg.originalName}</a>;
  };

  const getUnreadCount = (conv) => conv.unreadCount?.[username] || 0;
  const getOtherParticipant = (conv) => conv.participants.find(p => p !== username) || '';
  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date), diff = new Date() - d;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };
  const totalUnread = conversations.reduce((acc, c) => acc + getUnreadCount(c), 0);
  const isOnline = (uname) => onlineUsersList.includes(uname);



  if (screen === 'login') return (
    <AuthShell>
      <LogoMark subtitle="Welcome back" />
      {error && <div style={s.errorPill}>{error}</div>}
      <div style={s.fieldGroup}>
        <label style={s.fieldLabel}>Email address</label>
        <input style={s.field} type="email" placeholder="you@example.com" value={email}
          onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
      </div>
      <div style={s.fieldGroup}>
        <label style={s.fieldLabel}>Password</label>
        <input style={s.field} type="password" placeholder="••••••••••" value={password}
          onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
      </div>
      <button style={s.primaryBtn} onClick={handleLogin} disabled={loading}>
        {loading ? <span style={s.spinner}>⟳</span> : 'Sign in'}
      </button>
      <div style={s.orRow}><div style={s.orLine} /><span style={s.orText}>or</span><div style={s.orLine} /></div>
      <button style={s.googleBtn} onClick={handleGoogleLogin}>
        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/></svg>
        Continue with Google
      </button>
      <p style={s.switchRow}>New to CloudChat?{' '}
        <span style={s.switchLink} onClick={() => { setScreen('register'); setError(''); }}>Create account</span>
      </p>
    </AuthShell>
  );

  if (screen === 'register') return (
    <AuthShell>
      <LogoMark subtitle="Create your account" />
      {error && <div style={s.errorPill}>{error}</div>}
      <div style={s.fieldGroup}>
        <label style={s.fieldLabel}>Username</label>
        <input style={s.field} placeholder="cooluser123" value={username} onChange={e => setUsername(e.target.value)} />
      </div>
      <div style={s.fieldGroup}>
        <label style={s.fieldLabel}>Email address</label>
        <input style={s.field} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div style={s.fieldGroup}>
        <label style={s.fieldLabel}>Password</label>
        <input style={s.field} type="password" placeholder="••••••••••" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <button style={s.primaryBtn} onClick={handleRegister} disabled={loading}>
        {loading ? <span style={s.spinner}>⟳</span> : 'Create account'}
      </button>
      <div style={s.orRow}><div style={s.orLine} /><span style={s.orText}>or</span><div style={s.orLine} /></div>
      <button style={s.googleBtn} onClick={handleGoogleLogin}>
        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/></svg>
        Continue with Google
      </button>
      <p style={s.switchRow}>Already have an account?{' '}
        <span style={s.switchLink} onClick={() => { setScreen('login'); setError(''); }}>Sign in</span>
      </p>
    </AuthShell>
  );

  if (screen === 'home') return (
    <div style={s.authBg}>
      <style>{CSS}</style>
      <div style={s.authNoise} />
      <div style={s.authGlow1} />
      <div style={s.authGlow2} />
      <div style={{...s.authCard, maxWidth: '460px'}}>
        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
          <div style={s.logoMark}><span style={{ fontSize: '20px' }}>☁</span></div>
          <div style={s.brandName}>CloudChat</div>
          <div style={s.homeGreeting}>Good to see you, <span style={s.homeUsername}>{username}</span></div>
        </div>
        <div style={s.homeCardRow}>
          <div style={s.homeCard} onClick={() => setScreen('roomSelect')}>
            <div style={s.homeCardIconWrap}><span style={{ fontSize: '22px' }}>💬</span></div>
            <div style={s.homeCardBody}>
              <div style={s.homeCardTitle}>Group Rooms</div>
              <div style={s.homeCardMeta}>4 rooms · Real-time messaging · Open to all</div>
            </div>
            <div style={s.homeCardChevron}>›</div>
          </div>
          <div style={{...s.homeCard, borderColor: totalUnread > 0 ? 'rgba(0,229,160,0.3)' : 'rgba(255,255,255,0.06)'}}
            onClick={() => { fetchConversations(username); initSocket(username); setScreen('users'); }}>
            <div style={{...s.homeCardIconWrap, background: 'linear-gradient(135deg, rgba(0,229,160,0.15), rgba(0,200,140,0.05))'}}>
              <span style={{ fontSize: '22px' }}>🔐</span>
            </div>
            <div style={s.homeCardBody}>
              <div style={s.homeCardTitle}>
                Private Messages
                {totalUnread > 0 && <span style={s.unreadPill}>{totalUnread}</span>}
              </div>
              <div style={s.homeCardMeta}>End-to-end encrypted · Auto-expiring · Secure</div>
            </div>
            <div style={s.homeCardChevron}>›</div>
          </div>
        </div>
        <button style={s.signOutBtn} onClick={handleLogout}>Sign out</button>
        <div style={s.versionBadge}>CloudChat v2.0</div>
      </div>
    </div>
  );

  if (screen === 'roomSelect') return (
    <div style={s.authBg}>
      <style>{CSS}</style>
      <div style={s.authNoise} />
      <div style={s.authCard}>
        <button style={s.backLink} onClick={() => setScreen('home')}>← Back</button>
        <LogoMark subtitle="Choose a room" />
        <div style={s.roomGrid}>
          {[
            { id: 'general', emoji: '💬', label: 'General', desc: 'Open discussion' },
            { id: 'tech', emoji: '💻', label: 'Tech Talk', desc: 'Dev & engineering' },
            { id: 'cloud', emoji: '☁️', label: 'Cloud Eng', desc: 'Cloud architecture' },
            { id: 'random', emoji: '🎲', label: 'Random', desc: 'Anything goes' },
          ].map(r => (
            <div key={r.id} style={{...s.roomTile, ...(room === r.id ? s.roomTileActive : {})}}
              onClick={() => setRoom(r.id)}>
              <div style={s.roomEmoji}>{r.emoji}</div>
              <div style={s.roomLabel}>{r.label}</div>
              <div style={s.roomDesc}>{r.desc}</div>
            </div>
          ))}
        </div>
        <button style={s.primaryBtn} onClick={joinGroupChat}>Join #{room}</button>
      </div>
    </div>
  );

  const AppHeader = ({ left, right, sub }) => (
    <div style={s.appHeader}>
      <div style={s.appHeaderLeft}>{left}</div>
      {sub && <div style={s.appHeaderSub}>{sub}</div>}
      <div style={s.appHeaderRight}>{right}</div>
    </div>
  );

  if (screen === 'users') return (
    <div style={s.appShell}>
      <style>{CSS}</style>
      <AppHeader
        left={<>
          <button style={s.iconBtn} onClick={() => setScreen('home')}>←</button>
          <div>
            <div style={s.appTitle}>Messages</div>
            <div style={s.appSubtitle}>End-to-end encrypted</div>
          </div>
        </>}
        right={<>
          <div style={s.avatarChip}>{username?.charAt(0)?.toUpperCase()}</div>
          <button style={s.iconBtn} onClick={handleLogout} title="Sign out">⏻</button>
        </>}
      />
      <div style={s.searchWrap}>
        <div style={s.searchIcon}>⌕</div>
        <input style={s.searchField} placeholder="Search people..." value={searchQuery}
          onChange={e => handleSearch(e.target.value)} />
        {searchQuery && <button style={s.clearBtn} onClick={() => { setSearchQuery(''); setSearchResults([]); }}>✕</button>}
      </div>
      <div style={s.listArea}>
        {searchQuery.length > 0 ? (
          <>
            <div style={s.listSection}>Search results</div>
            {searchResults.length === 0
              ? <div style={s.emptyHint}>No users found for "{searchQuery}"</div>
              : searchResults.filter(u => u.username !== username).map((u, i) => (
                <div key={i} style={s.dmRow} onClick={() => openPrivateChat(u.username)}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar name={u.username} size={44} />
                    <OnlineDot isOnline={isOnline(u.username)} />
                  </div>
                  <div style={s.dmRowBody}>
                    <div style={s.dmRowName}>{u.username}</div>
                    <div style={s.dmRowMeta}>{isOnline(u.username) ? '● Online' : '○ Offline'}</div>
                  </div>
                  <div style={s.dmRowAction}>Message</div>
                </div>
              ))}
          </>
        ) : conversations.length === 0 ? (
          <div style={s.emptyState}>
            <div style={s.emptyEmoji}>🔐</div>
            <div style={s.emptyTitle}>No conversations</div>
            <div style={s.emptyDesc}>Search for someone to start an encrypted chat</div>
          </div>
        ) : (
          <>
            <div style={s.listSection}>Recent</div>
            {conversations.map((conv, i) => {
              const other = getOtherParticipant(conv);
              const unread = getUnreadCount(conv);
              return (
                <div key={i} style={{...s.dmRow, ...(unread > 0 ? s.dmRowUnread : {})}}
                  onClick={() => openPrivateChat(other)}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar name={other} size={44} />
                    <OnlineDot isOnline={isOnline(other)} />
                  </div>
                  <div style={s.dmRowBody}>
                    <div style={s.dmRowTop}>
                      <span style={{...s.dmRowName, fontWeight: unread > 0 ? '700' : '500'}}>{other}</span>
                      <span style={s.dmRowTime}>{formatTime(conv.lastMessageTime)}</span>
                    </div>
                    <div style={s.dmRowBottom}>
                      <span style={{...s.dmRowPreview, color: unread > 0 ? '#00e5a0' : 'rgba(255,255,255,0.35)'}}>
                        {conv.lastMessageFrom === username ? 'You: sent a message'
                          : unread > 0 ? `${unread} new encrypted message${unread > 1 ? 's' : ''}`
                          : 'Encrypted message'}
                      </span>
                      {unread > 0 && <span style={s.unreadCircle}>{unread}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );

  if (screen === 'private') return (
    <div style={s.appShell}>
      <style>{CSS}</style>
      <div style={s.appHeader}>
        <div style={s.appHeaderLeft}>
          <button style={s.iconBtn} onClick={() => setScreen('users')}>←</button>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar name={privateUser} size={36} />
            <OnlineDot isOnline={isOnline(privateUser)} />
          </div>
          <div>
            <div style={s.appTitle}>{privateUser}</div>
            <div style={{...s.appSubtitle, color: isOnline(privateUser) ? '#0891b2' : '#64748b'}}>
              {isOnline(privateUser) ? '● Online' : '○ Offline'}
            </div>
          </div>
        </div>
        <div style={s.appHeaderRight}>
          <button style={s.iconBtn} onClick={handleLogout}>⏻</button>
        </div>
      </div>

      <div style={s.msgArea}>
        {privateMessages.length === 0 && (
          <div style={s.emptyState}>
            <div style={s.emptyEmoji}>💬</div>
            <div style={s.emptyTitle}>Start a conversation</div>
            <div style={s.emptyDesc}>Say hello to {privateUser}</div>
          </div>
        )}
        {privateMessages.map((m, i) => {
          const mine = m.from === username;
          return (
            <InteractiveRawMessage 
              key={m._id || i} m={m} mine={mine} s={s} 
              isPrivate={true} renderMedia={renderMedia} 
              onDelete={(id, forEveryone) => handleDeleteMessage(id, forEveryone, true, privateUser)} 
              onForward={handleForwardMessage}
              onReply={setReplyTo}
              username={username}
            />
          );
        })}
        <div ref={privateBottomRef} />
      </div>
      {privateTyping && (
        <div style={s.typingBar}>
          <div style={s.typingDots}><span/><span/><span/></div>
          <span>{privateUser} is typing</span>
        </div>
      )}
      <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />
      <div style={s.inputBar}>
        <input type="file" ref={privateFileInputRef} onChange={e => handleFileUpload(e, true)}
          accept="image/*,video/*,audio/*" style={{ display: 'none' }} />
        <button style={s.attachIconBtn} onClick={() => privateFileInputRef.current.click()} disabled={privateUploading}>
          {privateUploading ? '⏳' : '⊕'}
        </button>
        <input style={s.msgInput} placeholder="Encrypted message…"
          value={privateMessage} onChange={handlePrivateTyping}
          onKeyDown={e => e.key === 'Enter' && sendPrivateMessage()} />
        {privateMessage.trim() ? (
          <button style={s.sendBtn} onClick={sendPrivateMessage} disabled={!privateMessage.trim()}>↑</button>
        ) : (
          <VoiceRecorder username={username} onSend={sendPrivateVoice} serverUrl={SERVER} />
        )}
      </div>
    </div>
  );

  // ── GROUP CHAT ──
  return (
    <div style={s.appShell}>
      <style>{CSS}</style>
      {notification && (
        <div style={s.toastBar} onClick={() => { setScreen('users'); setNotification(''); }}>
          <span style={s.toastDot}>🔒</span>
          {notification}
          <span style={s.toastAction}>View →</span>
        </div>
      )}
      <div style={s.appHeader}>
        <div style={s.appHeaderLeft}>
          <button style={s.iconBtn} onClick={leaveRoom}>←</button>
          <div style={s.roomPill}>#{room}</div>
          <div>
            <div style={s.appTitle}>{room.charAt(0).toUpperCase() + room.slice(1)}</div>
            <div style={s.appSubtitle}>
              <span style={{color: connected ? '#00e5a0' : '#ff6b6b'}}>●</span>
              {' '}{onlineUsers} {onlineUsers === 1 ? 'member' : 'members'} online
            </div>
          </div>
        </div>
        <div style={s.appHeaderRight}>
          {socketRef.current && (
            <MessageSearch
              socket={socketRef.current}
              room={room}
              onJumpTo={jumpToMessage}
            />
          )}
          <button style={s.dmBtn} onClick={() => { fetchConversations(username); setScreen('users'); }}>
            DM {totalUnread > 0 && <span style={s.dmBadge}>{totalUnread}</span>}
          </button>
          <button style={s.iconBtn} onClick={handleLogout}>⏻</button>
        </div>
      </div>



      <div style={s.msgArea}>
        {messages.length === 0 && (
          <div style={s.emptyState}>
            <div style={s.emptyEmoji}>💬</div>
            <div style={s.emptyTitle}>#{room} is quiet</div>
            <div style={s.emptyDesc}>Be the first to say something</div>
          </div>
        )}
        {messages.map((m, i) => {
          // New format — has reactions, read receipts, reply, voice
          if (m._id && m.text !== undefined) {
            return (
              <div key={String(m._id)} ref={el => { if (el) msgRefs.current[m._id] = el; }}>
                <MessageBubble
                  msg={m}
                  currentUser={username}
                  onReact={handleReact}
                  onReply={setReplyTo}
                  onDelete={handleDeleteMessage}
                  onForward={handleForwardMessage}
                />
              </div>
            );
          }
          // Old format — backward compatible
          const mine = m.username === username;
          return (
            <InteractiveRawMessage 
              key={m._id || i} m={m} mine={mine} s={s} 
              isPrivate={false} renderMedia={renderMedia} 
              openPrivateChat={openPrivateChat} isOnline={isOnline}
              onDelete={(id, forEveryone) => handleDeleteMessage(id, forEveryone, false)}
              onForward={handleForwardMessage} onReact={handleReact}
              onReply={setReplyTo}
              username={username}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {typing && (
        <div style={s.typingBar}>
          <div style={s.typingDots}><span/><span/><span/></div>
          <span>{typing}…</span>
        </div>
      )}

      <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />

      <div style={s.inputBar}>
        <input type="file" ref={fileInputRef} onChange={e => handleFileUpload(e, false)}
          accept="image/*,video/*,audio/*" style={{ display: 'none' }} />
        <button style={s.attachIconBtn} onClick={() => fileInputRef.current.click()} disabled={uploading}>
          {uploading ? '⏳' : '⊕'}
        </button>
        <input style={s.msgInput} placeholder={`Message #${room}…`}
          value={message} onChange={handleTyping}
          onKeyDown={e => e.key === 'Enter' && sendMessageWithReply()} />
        {message.trim() ? (
          <button style={s.sendBtn} onClick={sendMessageWithReply} disabled={!message.trim()}>↑</button>
        ) : (
          <VoiceRecorder room={room} username={username} onSend={sendVoice} serverUrl={SERVER} />
        )}
      </div>
    </div>
  );
}

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { margin: 0; font-family: 'Inter', sans-serif; background: #e0f7fa; color: #0f172a; -webkit-font-smoothing: antialiased; }
  input, button, select, textarea { font-family: 'Inter', sans-serif; }
  ::placeholder { color: rgba(15, 23, 42, 0.4); }
  ::selection { background: rgba(6, 182, 212, 0.3); color: #0f172a; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(6, 182, 212, 0.3); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(6, 182, 212, 0.6); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulseGlow {
    0%,100% { box-shadow: 0 0 14px rgba(6,182,212,0.3), 0 0 0 1px rgba(6,182,212,0.2) inset; }
    50% { box-shadow: 0 0 32px rgba(6,182,212,0.6), 0 0 60px rgba(6,182,212,0.1), 0 0 0 1px rgba(6,182,212,0.3) inset; }
  }
  @keyframes auroraShift {
    0%,100% { transform: translate(0,0) scale(1) rotate(0deg); opacity: 0.6; }
    33% { transform: translate(55px,-38px) scale(1.1) rotate(5deg); opacity: 0.8; }
    66% { transform: translate(-38px,28px) scale(0.92) rotate(-3deg); opacity: 0.5; }
  }
  @keyframes auroraShift2 {
    0%,100% { transform: translate(0,0) scale(1) rotate(0deg); opacity: 0.5; }
    33% { transform: translate(-52px,60px) scale(0.96) rotate(-4deg); opacity: 0.7; }
    66% { transform: translate(42px,-22px) scale(1.06) rotate(3deg); opacity: 0.4; }
  }
  @keyframes auroraShift3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,45px) scale(1.12); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes typingPulse { 0%,80%,100% { opacity:0.3; transform:scale(0.7); } 40% { opacity:1; transform:scale(1.1); } }
  @keyframes toastIn { from { opacity:0; transform:translateY(-105%) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
  @keyframes shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
  .msg-enter { animation: fadeUp 0.28s cubic-bezier(0.34,1.56,0.64,1); }
  .typing-dot span { display:inline-block; width:5px; height:5px; border-radius:50%; background:rgba(6,182,212,0.8); margin:0 2.5px; animation:typingPulse 1.4s ease-in-out infinite; }
  .typing-dot span:nth-child(2) { animation-delay:0.2s; }
  .typing-dot span:nth-child(3) { animation-delay:0.4s; }
  .icon-btn:hover { background:rgba(6,182,212,0.15) !important; border-color:rgba(6,182,212,0.3) !important; color:#0e7490 !important; transform:scale(1.05); }
  .attach-btn:hover { background:rgba(6,182,212,0.15) !important; border-color:rgba(6,182,212,0.3) !important; }
  .send-btn:hover { transform:scale(1.08) !important; box-shadow:0 8px 36px rgba(6,182,212,0.6) !important; }
  .home-card:hover { background:rgba(255,255,255,0.8) !important; border-color:rgba(6,182,212,0.3) !important; transform:translateY(-3px) !important; box-shadow:0 12px 40px rgba(6,182,212,0.12) !important; }
  .dm-row:hover { background:rgba(255,255,255,0.6) !important; }
  .room-tile:hover { border-color:rgba(6,182,212,0.4) !important; background:rgba(255,255,255,0.7) !important; transform:translateY(-2px) !important; box-shadow:0 8px 28px rgba(6,182,212,0.15) !important; }
  .msg-input:focus { border-color:rgba(6,182,212,0.5) !important; box-shadow:0 0 0 3px rgba(6,182,212,0.15), inset 0 1px 0 rgba(255,255,255,0.5) !important; }
  .primary-btn:hover { transform:translateY(-1px); box-shadow:0 8px 32px rgba(6,182,212,0.5) !important; }
  .google-btn:hover { background:rgba(255,255,255,0.8) !important; border-color:rgba(6,182,212,0.2) !important; }
  .sign-out-btn:hover { background:rgba(239,68,68,0.1) !important; border-color:rgba(239,68,68,0.3) !important; color:#ef4444 !important; }
  .dm-row-action:hover { background:rgba(6,182,212,0.15) !important; border-color:rgba(6,182,212,0.4) !important; color:#0e7490 !important; }
`;

const s = {
  authBg: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(ellipse 120% 80% at 60% -10%, rgba(34,211,238,0.4) 0%, transparent 55%), radial-gradient(ellipse 80% 60% at -10% 80%, rgba(56,189,248,0.3) 0%, transparent 55%), #f0f9ff',
    position: 'relative', overflow: 'hidden', padding: '16px',
  },
  authNoise: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 },
  authGlow1: {
    position: 'fixed', width: '700px', height: '700px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(6,182,212,0.3) 0%, rgba(8,145,178,0.1) 50%, transparent 72%)',
    top: '-200px', right: '-180px', pointerEvents: 'none', zIndex: 0,
    animation: 'auroraShift 20s ease-in-out infinite', filter: 'blur(10px)',
  },
  authGlow2: {
    position: 'fixed', width: '580px', height: '580px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(56,189,248,0.25) 0%, rgba(2,132,199,0.1) 50%, transparent 72%)',
    bottom: '-160px', left: '-130px', pointerEvents: 'none', zIndex: 0,
    animation: 'auroraShift2 25s ease-in-out infinite', filter: 'blur(12px)',
  },
  authCard: {
    width: '100%', maxWidth: '420px', position: 'relative', zIndex: 1,
    background: 'rgba(255,255,255,0.65)',
    border: '1px solid rgba(255,255,255,0.8)',
    borderRadius: '28px', padding: '42px 38px',
    display: 'flex', flexDirection: 'column', gap: '18px',
    backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
    boxShadow: '0 0 0 1px rgba(255,255,255,0.4) inset, 0 24px 64px rgba(0,0,0,0.08), 0 0 80px rgba(6,182,212,0.15)',
  },
  logoMark: {
    width: '58px', height: '58px', borderRadius: '19px', margin: '0 auto 10px',
    background: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
    boxShadow: '0 12px 30px rgba(6,182,212,0.4), 0 0 0 1px rgba(255,255,255,0.4) inset',
    animation: 'pulseGlow 3.5s ease-in-out infinite',
  },
  brandName: {
    fontSize: '25px', fontWeight: '800', letterSpacing: '-0.045em',
    background: 'linear-gradient(135deg, #0f172a 0%, #334155 60%, #475569 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  brandSub: { fontSize: '13px', color: 'rgba(15,23,42,0.5)', marginTop: '3px', letterSpacing: '-0.01em' },
  errorPill: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '14px', padding: '10px 16px', color: '#dc2626', fontSize: '13px',
    backdropFilter: 'blur(10px)',
  },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '7px' },
  fieldLabel: {
    fontSize: '10px', fontWeight: '700', color: '#64748b',
    letterSpacing: '0.08em', textTransform: 'uppercase',
  },
  field: {
    padding: '13px 17px', borderRadius: '15px', fontSize: '15px', color: '#0f172a',
    outline: 'none', background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(148,163,184,0.3)',
    transition: 'all 0.22s', width: '100%',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
  },
  primaryBtn: {
    padding: '14px', borderRadius: '15px', color: '#fff', fontSize: '15px', fontWeight: '700',
    cursor: 'pointer', width: '100%', letterSpacing: '-0.01em', border: 'none',
    background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
    boxShadow: '0 6px 20px rgba(6,182,212,0.4), 0 0 0 1px rgba(255,255,255,0.2) inset',
    transition: 'all 0.22s',
  },
  orRow: { display: 'flex', alignItems: 'center', gap: '14px' },
  orLine: { flex: 1, height: '1px', background: 'rgba(148,163,184,0.2)' },
  orText: { fontSize: '12px', color: '#64748b' },
  googleBtn: {
    padding: '13px', background: 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(148,163,184,0.3)', borderRadius: '15px',
    color: '#334155', fontSize: '14px', cursor: 'pointer', fontWeight: '600',
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '10px', transition: 'all 0.22s', letterSpacing: '-0.01em',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
  },
  switchRow: { fontSize: '13px', color: '#64748b', textAlign: 'center' },
  switchLink: { color: '#0891b2', cursor: 'pointer', fontWeight: '700' },
  spinner: { display: 'inline-block', animation: 'spin 0.8s linear infinite' },
  backLink: {
    background: 'none', border: 'none', color: '#64748b',
    fontSize: '13px', cursor: 'pointer', padding: '0', textAlign: 'left',
    transition: 'color 0.18s',
  },
  homeGreeting: { fontSize: '14px', color: '#64748b', marginTop: '5px', letterSpacing: '-0.01em' },
  homeUsername: {
    background: 'linear-gradient(135deg, #06b6d4, #0284c7)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: '800',
  },
  homeCardRow: { display: 'flex', flexDirection: 'column', gap: '12px' },
  homeCard: {
    display: 'flex', alignItems: 'center', gap: '16px',
    background: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.8)',
    borderRadius: '22px', padding: '20px 18px',
    cursor: 'pointer', transition: 'all 0.24s',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 4px 12px rgba(0,0,0,0.03)',
  },
  homeCardIconWrap: {
    width: '52px', height: '52px', borderRadius: '17px', flexShrink: 0,
    background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.1))',
    border: '1px solid rgba(6,182,212,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(6,182,212,0.15)',
  },
  homeCardBody: { flex: 1 },
  homeCardTitle: {
    fontSize: '15px', fontWeight: '700', color: '#0f172a',
    display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '-0.02em',
  },
  homeCardMeta: { fontSize: '12px', color: '#64748b', marginTop: '4px', letterSpacing: '-0.01em' },
  homeCardChevron: { fontSize: '22px', color: '#94a3b8', fontWeight: '300' },
  unreadPill: {
    background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: '#fff',
    borderRadius: '99px', padding: '1px 9px', fontSize: '11px', fontWeight: '700',
    boxShadow: '0 2px 8px rgba(6,182,212,0.4)',
  },
  signOutBtn: {
    background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(148,163,184,0.3)',
    borderRadius: '15px', color: '#64748b', fontSize: '13px', fontWeight: '600',
    cursor: 'pointer', padding: '12px', width: '100%', transition: 'all 0.22s',
    letterSpacing: '-0.01em',
  },
  versionBadge: {
    textAlign: 'center', fontSize: '11px', color: '#94a3b8',
    letterSpacing: '0.05em', marginTop: '2px', fontWeight: '600',
  },
  roomGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  roomTile: {
    background: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.8)',
    borderRadius: '22px', padding: '22px 14px',
    cursor: 'pointer', textAlign: 'center',
    transition: 'all 0.24s',
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 4px 12px rgba(0,0,0,0.03)',
  },
  roomTileActive: {
    background: 'rgba(255,255,255,0.8)',
    border: '1px solid rgba(6,182,212,0.4)',
    boxShadow: '0 8px 24px rgba(6,182,212,0.15), inset 0 1px 0 rgba(255,255,255,0.8)',
  },
  roomEmoji: { fontSize: '28px', marginBottom: '10px' },
  roomLabel: { fontSize: '14px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' },
  roomDesc: { fontSize: '11px', color: '#64748b', marginTop: '4px' },
  appShell: {
    display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
    background: 'radial-gradient(ellipse 120% 80% at 60% -10%, rgba(34,211,238,0.2) 0%, transparent 55%), radial-gradient(ellipse 80% 60% at -10% 80%, rgba(56,189,248,0.15) 0%, transparent 55%), #f0f9ff',
    position: 'relative',
  },
  appHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.5)',
    background: 'rgba(255,255,255,0.65)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    minHeight: '64px', flexShrink: 0, gap: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
    position: 'relative', zIndex: 20,
  },
  appHeaderLeft: { display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 },
  appHeaderRight: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  appHeaderSub: { fontSize: '11px', color: '#64748b', textAlign: 'center', flex: 1, fontWeight: '600' },
  appTitle: {
    fontSize: '16px', fontWeight: '800', letterSpacing: '-0.035em', lineHeight: 1.2,
    background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  appSubtitle: { fontSize: '11px', color: '#64748b', marginTop: '2px', letterSpacing: '-0.01em', fontWeight: '500' },
  iconBtn: {
    background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(148,163,184,0.3)',
    borderRadius: '13px', color: '#334155',
    fontSize: '16px', cursor: 'pointer',
    width: '38px', height: '38px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'all 0.2s',
  },
  avatarChip: {
    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
    background: 'linear-gradient(135deg, #22d3ee, #0ea5e9)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '13px', fontWeight: '800', color: '#fff',
    boxShadow: '0 2px 8px rgba(6,182,212,0.4), 0 0 0 2px rgba(255,255,255,0.8)',
  },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px',
    borderBottom: '1px solid rgba(148,163,184,0.1)',
    background: 'rgba(255,255,255,0.3)',
  },
  searchIcon: { color: '#94a3b8', fontSize: '18px', flexShrink: 0 },
  searchField: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    color: '#0f172a', fontSize: '14px', padding: '4px 0', letterSpacing: '-0.01em',
    fontWeight: '500',
  },
  clearBtn: {
    background: 'none', border: 'none', color: '#94a3b8',
    cursor: 'pointer', fontSize: '14px', padding: '4px', transition: 'color 0.18s',
  },
  listArea: { flex: 1, overflowY: 'auto', padding: '8px 12px' },
  listSection: {
    fontSize: '10px', fontWeight: '800', color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: '0.1em', padding: '14px 8px 6px',
  },
  dmRow: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 12px', borderRadius: '18px',
    cursor: 'pointer', transition: 'all 0.18s', marginBottom: '3px',
  },
  dmRowUnread: {
    background: 'rgba(255,255,255,0.6)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02), inset 0 0 0 1px rgba(6,182,212,0.3)',
  },
  dmRowBody: { flex: 1, minWidth: 0 },
  dmRowTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' },
  dmRowBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  dmRowName: { fontSize: '14px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' },
  dmRowMeta: { fontSize: '12px', color: '#64748b' },
  dmRowTime: { fontSize: '11px', color: '#94a3b8', flexShrink: 0, fontWeight: '600' },
  dmRowPreview: {
    fontSize: '12px', color: '#64748b', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
  },
  dmRowAction: {
    background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(148,163,184,0.3)',
    borderRadius: '10px', padding: '5px 13px', fontSize: '12px', fontWeight: '600',
    color: '#334155', flexShrink: 0, transition: 'all 0.18s',
    cursor: 'pointer',
  },
  unreadCircle: {
    background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: '#fff',
    borderRadius: '99px', minWidth: '20px', height: '20px', padding: '0 6px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: '800', flexShrink: 0, marginLeft: '8px',
    boxShadow: '0 2px 6px rgba(6,182,212,0.4)',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', flex: 1, gap: '12px', padding: '60px 20px',
  },
  emptyEmoji: { fontSize: '48px', opacity: 0.8, marginBottom: '4px' },
  emptyTitle: { fontSize: '16px', fontWeight: '800', color: '#334155', letterSpacing: '-0.02em' },
  emptyDesc: { fontSize: '13px', color: '#64748b', textAlign: 'center', maxWidth: '240px' },
  emptyHint: { fontSize: '13px', color: '#64748b', padding: '20px', textAlign: 'center', fontWeight: '500' },
  e2eBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    padding: '7px 20px', fontSize: '11px', color: '#0369a1', fontWeight: '600',
    background: 'linear-gradient(90deg, rgba(6,182,212,0.1), rgba(14,165,233,0.05) 50%, rgba(6,182,212,0.1))',
    borderBottom: '1px solid rgba(6,182,212,0.2)', flexShrink: 0,
    letterSpacing: '-0.01em',
  },
  e2eBannerDot: { fontSize: '13px' },
  msgArea: {
    flex: 1, overflowY: 'auto', padding: '20px 24px',
    display: 'flex', flexDirection: 'column', gap: '8px',
    position: 'relative', zIndex: 1,
  },
  msgRowMine: {
    display: 'flex', alignItems: 'flex-end', gap: '8px',
    justifyContent: 'flex-end',
    animation: 'fadeUp 0.26s cubic-bezier(0.34,1.56,0.64,1)',
  },
  msgRowTheirs: {
    display: 'flex', alignItems: 'flex-end', gap: '8px',
    justifyContent: 'flex-start',
    animation: 'fadeUp 0.26s cubic-bezier(0.34,1.56,0.64,1)',
  },
  msgBubbleWrap: { maxWidth: '72%', display: 'flex', flexDirection: 'column' },
  senderRow: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' },
  senderName: { fontSize: '12px', fontWeight: '700', color: '#0891b2', cursor: 'pointer', letterSpacing: '-0.01em' },
  onlineTag: { fontSize: '10px' },
  bubbleMine: {
    background: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)',
    color: '#fff', padding: '12px 16px',
    borderRadius: '22px 22px 6px 22px',
    fontSize: '14px', lineHeight: '1.58', wordBreak: 'break-word',
    letterSpacing: '-0.01em',
    boxShadow: '0 4px 12px rgba(6,182,212,0.3), 0 1px 0 rgba(255,255,255,0.2) inset',
    position: 'relative', transition: 'filter 0.2s',
  },
  bubbleTheirs: {
    background: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(255,255,255,1)',
    backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
    color: '#0f172a', padding: '12px 16px',
    borderRadius: '22px 22px 22px 6px',
    fontSize: '14px', lineHeight: '1.58', wordBreak: 'break-word',
    letterSpacing: '-0.01em',
    boxShadow: '0 4px 12px rgba(0,0,0,0.04), 0 1px 0 rgba(255,255,255,0.5) inset',
    transition: 'background 0.2s',
  },
  msgMeta: {
    fontSize: '10px',
    marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px',
  },
  msgMetaMine: { color: 'rgba(255, 255, 255, 0.85)' },
  msgMetaTheirs: { color: 'rgba(15, 23, 42, 0.45)' },
  expiryTag: { color: 'rgba(239,68,68,0.8)' },
  typingBar: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '6px 20px 2px', fontSize: '12px',
    color: '#64748b', flexShrink: 0, letterSpacing: '-0.01em', fontWeight: '500',
  },
  typingDots: { display: 'flex', gap: '3px' },
  inputBar: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 18px 20px',
    borderTop: '1px solid rgba(255,255,255,0.6)',
    background: 'rgba(255,255,255,0.7)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    flexShrink: 0, position: 'relative', zIndex: 20,
    boxShadow: '0 -2px 10px rgba(0,0,0,0.02)',
  },
  msgInput: {
    flex: 1, background: 'rgba(255,255,255,0.8)',
    border: '1px solid rgba(148,163,184,0.3)',
    borderRadius: '20px', padding: '13px 20px',
    color: '#0f172a', fontSize: '14px', outline: 'none',
    letterSpacing: '-0.01em', lineHeight: 1.45,
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
    transition: 'border-color 0.22s, box-shadow 0.22s',
  },
  attachIconBtn: {
    width: '44px', height: '44px', borderRadius: '14px', flexShrink: 0,
    background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(148,163,184,0.3)',
    color: '#64748b', fontSize: '20px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.22s',
  },
  sendBtn: {
    width: '44px', height: '44px', borderRadius: '14px', flexShrink: 0,
    background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
    border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(6,182,212,0.4), 0 0 0 1px rgba(255,255,255,0.2) inset',
    transition: 'all 0.22s',
  },
  sendBtnOff: {
    width: '44px', height: '44px', borderRadius: '14px', flexShrink: 0,
    background: 'rgba(148,163,184,0.2)',
    border: '1px solid rgba(148,163,184,0.2)',
    color: 'rgba(100,116,139,0.5)', fontSize: '18px', cursor: 'not-allowed',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  roomPill: {
    background: 'linear-gradient(135deg, #e0f2fe, #cffafe)',
    border: '1px solid rgba(6,182,212,0.3)', borderRadius: '11px',
    padding: '4px 13px', fontSize: '12px', color: '#0369a1', fontWeight: '800',
    flexShrink: 0, fontFamily: "'JetBrains Mono', monospace",
    boxShadow: '0 2px 6px rgba(6,182,212,0.15)',
  },
  dmBtn: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.6))',
    border: '1px solid rgba(148,163,184,0.3)', borderRadius: '13px',
    padding: '7px 15px', color: '#0f172a', fontSize: '13px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)', transition: 'all 0.2s',
    letterSpacing: '-0.01em',
  },
  dmBadge: {
    background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: '#fff',
    borderRadius: '99px', padding: '1px 7px', fontSize: '11px', fontWeight: '800',
    boxShadow: '0 2px 6px rgba(6,182,212,0.4)',
  },
  toastBar: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 22px',
    background: 'linear-gradient(90deg, rgba(6,182,212,0.95), rgba(8,145,178,0.95))',
    color: '#fff', fontSize: '13px', fontWeight: '700',
    cursor: 'pointer', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000,
    animation: 'toastIn 0.34s cubic-bezier(0.34,1.56,0.64,1)',
    boxShadow: '0 6px 20px rgba(6,182,212,0.4)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    letterSpacing: '-0.01em',
  },
  toastDot: { fontSize: '16px' },
  toastAction: { marginLeft: 'auto', fontWeight: '800', opacity: 0.9 },
  mediaImage: {
    maxWidth: '100%', maxHeight: '260px', borderRadius: '18px',
    cursor: 'pointer', display: 'block',
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)', border: '1px solid rgba(255,255,255,0.8)',
  },
  mediaVideo: { maxWidth: '100%', maxHeight: '260px', borderRadius: '18px', display: 'block' },
  mediaAudio: { width: '100%', borderRadius: '12px' },
  fileLink: { color: '#0891b2', textDecoration: 'none', fontWeight: '700', fontSize: '13px' },
};

  const InteractiveRawMessage = ({ m, mine, s, isPrivate, renderMedia, openPrivateChat, isOnline, onDelete, onForward, onReact, onReply, username }) => {
    const [showMenu, setShowMenu] = useState(false);
    const holdTimer = useRef(null);

    const [swipeOffset, setSwipeOffset] = useState(0);
    const touchStartRef = useRef(null);

    const handleDown = (e) => { 
      holdTimer.current = setTimeout(() => setShowMenu(true), 500);
      if (e.touches) touchStartRef.current = e.touches[0].clientX;
    };
    const handleUp = () => { 
      clearTimeout(holdTimer.current);
      if (swipeOffset > 80 && onReply) onReply(m);
      setSwipeOffset(0);
      touchStartRef.current = null;
    };

    const handleTouchMove = (e) => {
       if (touchStartRef.current !== null) {
          const deltaX = e.touches[0].clientX - touchStartRef.current;
          if (deltaX > 0 && deltaX < 120) {
             setSwipeOffset(deltaX);
          }
       }
    };

    return (
      <div style={{...(mine ? s.msgRowMine : s.msgRowTheirs), position: 'relative', transform: \	ranslateX(\px)\, transition: swipeOffset ? 'none' : 'transform 0.2s', touchAction: 'pan-y'}}
        onMouseDown={handleDown} onMouseUp={handleUp} 
        onTouchStart={handleDown} onTouchMove={handleTouchMove} onTouchEnd={handleUp}
        onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}>
        
        {!mine && isPrivate && <Avatar name={m.from} size={28} />}
        {!mine && !isPrivate && (
          <div style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }}
            onClick={() => openPrivateChat && openPrivateChat(m.username)}>
            <Avatar name={m.username} size={28} />
            {isOnline && <OnlineDot isOnline={isOnline(m.username)} />}
          </div>
        )}

        <div style={{...s.msgBubbleWrap, position: 'relative'}}>
          {!mine && !isPrivate && <div onClick={() => openPrivateChat && openPrivateChat(m.username)} style={{fontSize:'12px',color:'#ccc',cursor:'pointer',marginBottom:'2px'}}>{m.username}</div>}
          {m.replyTo && (
            <div style={{ padding: '6px', margin: '0 0 6px 0', borderLeft: '3px solid #000', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', fontSize: '12px' }}>
               <strong style={{ color: '#000' }}>{m.replyTo.username || m.replyTo.from}</strong>
               <div style={{ color: '#333' }}>{m.replyTo.type === 'voice' ? '🎤 Voice message' : m.replyTo.text || m.replyTo.message}</div>
            </div>
          )}
          <div style={{...(mine ? s.bubbleMine : s.bubbleTheirs), opacity: m.temp ? 0.6 : 1}}>
            {m.type === 'voice' ? <VoicePlayer msg={m} isOwn={mine} /> : (m.fileUrl ? renderMedia(m) : (m.message || m.text))}
          </div>
          <div style={{...s.msgMeta, ...(mine ? s.msgMetaMine : s.msgMetaTheirs)}}>
            {m.temp ? '⏳ Sending…' : new Date(m.timestamp || m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
            {isPrivate && m.expiresAt && !m.temp && (
              <span style={s.expiryTag}>· 🔥 {new Date(m.expiresAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
            )}
            {mine && isPrivate && (
              m.readBy && m.readBy.length > 0
                ? <span title="Read" style={{color:'#22d3ee', fontWeight:700, fontSize:'12px', letterSpacing:'-1px'}}>✓✓</span>
                : m.deliveredTo && m.deliveredTo.length > 0
                  ? <span title="Delivered" style={{color:'rgba(255,255,255,0.7)', fontWeight:700, fontSize:'12px', letterSpacing:'-1px'}}>✓✓</span>
                  : <span title="Sent" style={{color:'rgba(255,255,255,0.6)', fontWeight:700, fontSize:'12px', letterSpacing:'-1px'}}>✓</span>
            )}
          </div>
          
          {!isPrivate && m.reactions && Object.keys(m.reactions).length > 0 && (
            <div style={{display:'flex', flexWrap:'wrap', gap:'2px', position:'absolute', bottom:'-10px', [mine ? 'left' : 'right']:'10px', zIndex:5}}>
              {Object.entries(m.reactions).map(([emoji, reaction]) => reaction && reaction.count > 0 && (
                <div key={emoji} style={{display:'flex', alignItems:'center', gap:'2px', background: reaction.users?.includes(username) ? '#e3f2fd' : '#f0f0f0', border:`1.5px solid ${reaction.users?.includes(username) ? '#90caf9' : '#fff'}`, borderRadius:'12px', padding:'2px 5px', fontSize:'11px', cursor:'pointer', boxShadow:'0 1px 2px rgba(0,0,0,0.1)'}} onClick={(e) => { e.stopPropagation(); if(onReact) onReact({messageId: m._id, emoji}); }}>
                  <span>{emoji}</span>
                  <span style={{fontSize:'10px', fontWeight:600, color:'#555'}}>{reaction.count}</span>
                </div>
              ))}
            </div>
          )}

          {showMenu && (
            <div className="context-menu" style={{position: 'absolute', top: '50%', transform:'translateY(-50%)', [mine ? 'right' : 'left']: '105%', minWidth:'150px', zIndex: 10, background: '#1a1a20', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)'}} onMouseLeave={() => setShowMenu(false)}>
              {!isPrivate && (
                <div style={{display:'flex', gap:'4px', marginBottom:'8px', paddingBottom:'8px', borderBottom:'1px solid rgba(255,255,255,0.1)', justifyContent:'center'}}>
                  {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(e => (
                    <button key={e} style={{background:'none', border:'none', fontSize:'18px', cursor:'pointer'}} onClick={() => { if(onReact) onReact({messageId: m._id, emoji: e}); setShowMenu(false); }}>{e}</button>
                  ))}
                </div>
              )}
              <div className="menu-actions" style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                <button style={{background: 'none', border: 'none', color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: '13px'}} onClick={() => { if(onReply) onReply(m); setShowMenu(false); }}>↩ Reply</button>
                <button style={{background: 'none', border: 'none', color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: '13px'}} onClick={() => { if(onForward) onForward(m); setShowMenu(false); }}>➡ Forward</button>
                <button style={{background: 'none', border: 'none', color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: '13px'}} onClick={() => { navigator.clipboard.writeText(m.message || m.text || ''); setShowMenu(false); }}>📋 Copy</button>
                {mine && <button style={{background: 'none', border: 'none', color: '#ff8a8a', textAlign: 'left', cursor: 'pointer', fontSize: '13px'}} onClick={() => { if(onDelete) onDelete(m._id || m.timestamp, true); setShowMenu(false); }}>🗑 Delete for everyone</button>}
                <button style={{background: 'none', border: 'none', color: '#ff8a8a', textAlign: 'left', cursor: 'pointer', fontSize: '13px'}} onClick={() => { if(onDelete) onDelete(m._id || m.timestamp, false); setShowMenu(false); }}>🗑 Delete for me</button>
              </div>
            </div>
          )}
        </div>
        {mine && <Avatar name={username} size={28} gradient />}
      </div>
    );
  };

  const AuthShell = ({ children }) => (
    <div style={s.authBg}>
      <style>{CSS}</style>
      <div style={s.authNoise} />
      <div style={s.authGlow1} />
      <div style={s.authGlow2} />
      <div style={s.authCard}>{children}</div>
    </div>
  );

  const LogoMark = ({ subtitle }) => (
    <div style={{ textAlign: 'center', marginBottom: '8px' }}>
      <div style={s.logoMark}><span style={{ fontSize: '20px' }}>☁</span></div>
      <div style={s.brandName}>CloudChat</div>
      {subtitle && <div style={s.brandSub}>{subtitle}</div>}
    </div>
  );

export default App;
