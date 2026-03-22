import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';

const OnlineDot = ({ isOnline }) => (
  <span style={{
    position: 'absolute', bottom: '0', right: '0',
    width: '12px', height: '12px', borderRadius: '50%',
    background: isOnline ? '#51cf66' : '#555',
    border: '2px solid #0f0c29',
  }} />
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
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const privateBottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const privateFileInputRef = useRef(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUsername = localStorage.getItem('username');
    if (savedToken && savedUsername) {
      setToken(savedToken);
      setUsername(savedUsername);
      setScreen('home');
    }
    const params = new URLSearchParams(window.location.search);
    const googleToken = params.get('token');
    const googleUsername = params.get('username');
    if (googleToken && googleUsername) {
      localStorage.setItem('token', googleToken);
      localStorage.setItem('username', googleUsername);
      setToken(googleToken);
      setUsername(googleUsername);
      setScreen('home');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    if (username && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [username]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    privateBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [privateMessages]);

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
    } catch { setError('Registration failed.'); }
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
    } catch { setError('Login failed.'); }
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
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(title, { body, icon: '/favicon.ico' });
          }
        });
      }
    }
  };

  const initSocket = (uname) => {
    if (socketRef.current?.connected) return socketRef.current;
    const socket = io(SERVER, { auth: { token }, reconnection: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('register_user', uname);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('online_count', (count) => setOnlineUsers(count));
    socket.on('online_users_list', (list) => setOnlineUsersList(list));
    socket.on('message_history', (history) => setMessages(history));
    socket.on('receive_message', (msg) => setMessages(prev => [...prev, msg]));
    socket.on('user_typing', (user) => {
      setTyping(`${user} is typing...`);
      setTimeout(() => setTyping(''), 2000);
    });
    socket.on('private_history', (history) => setPrivateMessages(history));
    socket.on('receive_private', (msg) => {
      setPrivateMessages(prev => {
        if (msg.from === uname) {
          const filtered = prev.filter(m => !m.temp);
          return [...filtered, msg];
        }
        return [...prev, msg];
      });
      fetchConversations(uname);
    });
    socket.on('private_user_typing', (user) => {
      setPrivateTyping(`${user} is typing...`);
      setTimeout(() => setPrivateTyping(''), 2000);
    });
    socket.on('private_notification', ({ from }) => {
      // In-app banner
      setNotification(`💬 New message from ${from}`);
      setTimeout(() => setNotification(''), 6000);
      fetchConversations(uname);
      // Browser notification
      sendBrowserNotification('CloudChat 🔒', `New encrypted message from ${from}`);
    });
    socket.on('refresh_conversations', () => {
      fetchConversations(uname);
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
    setPrivateUser(targetUser);
    setPrivateMessages([]);
    socket.emit('join_private', { from: username, to: targetUser });
    socket.emit('mark_read', { from: username, to: targetUser });
    setSearchQuery(''); setSearchResults([]);
    setScreen('private');
    setTimeout(() => fetchConversations(username), 500);
  };

  const sendMessage = () => {
    if (message.trim() && socketRef.current) {
      socketRef.current.emit('send_message', { room, username, message });
      setMessage('');
    }
  };

  const sendPrivateMessage = () => {
    if (privateMessage.trim() && socketRef.current) {
      const msgText = privateMessage;
      const tempMsg = {
        from: username, to: privateUser, message: msgText,
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        temp: true,
      };
      setPrivateMessages(prev => [...prev, tempMsg]);
      setPrivateMessage('');
      socketRef.current.emit('send_private', { from: username, to: privateUser, message: msgText });
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
      if (isPrivate) {
        const tempMsg = {
          from: username, to: privateUser,
          message: `📎 ${data.originalName}`,
          fileUrl: `${SERVER}/media/file/${data.fileId}`,
          mimetype: data.mimetype,
          originalName: data.originalName,
          timestamp: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          temp: true,
        };
        setPrivateMessages(prev => [...prev, tempMsg]);
        socketRef.current.emit('send_private', {
          from: username, to: privateUser,
          message: `📎 ${data.originalName}`,
          fileUrl: `${SERVER}/media/file/${data.fileId}`,
          mimetype: data.mimetype,
          originalName: data.originalName,
        });
      } else {
        socketRef.current.emit('send_message', {
          room, username,
          message: `📎 ${data.originalName}`,
          fileId: data.fileId,
          fileUrl: `${SERVER}/media/file/${data.fileId}`,
          mimetype: data.mimetype,
          originalName: data.originalName,
        });
      }
    } catch (err) { alert('Upload failed: ' + err.message); }
    finally {
      isPrivate ? setPrivateUploading(false) : setUploading(false);
      e.target.value = '';
    }
  };

  const leaveRoom = () => {
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    setMessages([]); setScreen('home');
  };

  const renderMedia = (msg) => {
    if (!msg.fileUrl) return null;
    const mime = msg.mimetype || '';
    if (mime.startsWith('image/')) return <img src={msg.fileUrl} alt={msg.originalName} style={styles.mediaImage} onClick={() => window.open(msg.fileUrl, '_blank')} />;
    if (mime.startsWith('video/')) return <video controls style={styles.mediaVideo}><source src={msg.fileUrl} type={mime} /></video>;
    if (mime.startsWith('audio/')) return <audio controls style={styles.mediaAudio}><source src={msg.fileUrl} type={mime} /></audio>;
    return <a href={msg.fileUrl} target="_blank" rel="noreferrer" style={styles.fileLink}>📎 {msg.originalName}</a>;
  };

  const getUnreadCount = (conv) => conv.unreadCount?.[username] || 0;
  const getOtherParticipant = (conv) => conv.participants.find(p => p !== username) || '';
  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date), diff = new Date() - d;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString();
  };
  const totalUnread = conversations.reduce((acc, c) => acc + getUnreadCount(c), 0);
  const isOnline = (uname) => onlineUsersList.includes(uname);

  // ─── LOGIN ───
  if (screen === 'login') return (
    <div style={styles.authContainer}>
      <style>{CSS}</style>
      <div style={styles.authBox}>
        <div style={styles.logoContainer}><span style={styles.logoIcon}>☁️</span><h1 style={styles.logo}>CloudChat</h1></div>
        <p style={styles.subtitle}>Sign in to continue</p>
        {error && <div style={styles.errorBox}>{error}</div>}
        <div style={styles.inputGroup}><label style={styles.label}>Email</label>
          <input style={styles.input} type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} /></div>
        <div style={styles.inputGroup}><label style={styles.label}>Password</label>
          <input style={styles.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} /></div>
        <button style={styles.primaryBtn} onClick={handleLogin} disabled={loading}>{loading ? 'Signing in...' : 'Sign In →'}</button>
        <div style={styles.divider}><span>or</span></div>
        <button style={styles.googleBtn} onClick={handleGoogleLogin}><span style={styles.googleIcon}>G</span> Continue with Google</button>
        <p style={styles.switchText}>Don't have an account?{' '}<span style={styles.switchLink} onClick={() => { setScreen('register'); setError(''); }}>Register</span></p>
      </div>
    </div>
  );

  // ─── REGISTER ───
  if (screen === 'register') return (
    <div style={styles.authContainer}>
      <style>{CSS}</style>
      <div style={styles.authBox}>
        <div style={styles.logoContainer}><span style={styles.logoIcon}>☁️</span><h1 style={styles.logo}>CloudChat</h1></div>
        <p style={styles.subtitle}>Create your account</p>
        {error && <div style={styles.errorBox}>{error}</div>}
        <div style={styles.inputGroup}><label style={styles.label}>Username</label>
          <input style={styles.input} placeholder="cooluser123" value={username} onChange={e => setUsername(e.target.value)} /></div>
        <div style={styles.inputGroup}><label style={styles.label}>Email</label>
          <input style={styles.input} type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div style={styles.inputGroup}><label style={styles.label}>Password</label>
          <input style={styles.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} /></div>
        <button style={styles.primaryBtn} onClick={handleRegister} disabled={loading}>{loading ? 'Creating account...' : 'Create Account →'}</button>
        <div style={styles.divider}><span>or</span></div>
        <button style={styles.googleBtn} onClick={handleGoogleLogin}><span style={styles.googleIcon}>G</span> Continue with Google</button>
        <p style={styles.switchText}>Already have an account?{' '}<span style={styles.switchLink} onClick={() => { setScreen('login'); setError(''); }}>Sign In</span></p>
      </div>
    </div>
  );

  // ─── HOME ───
  if (screen === 'home') return (
    <div style={styles.authContainer}>
      <style>{CSS}</style>
      <div style={{...styles.authBox, maxWidth: '480px'}}>
        <div style={styles.logoContainer}><span style={styles.logoIcon}>☁️</span><h1 style={styles.logo}>CloudChat</h1></div>
        <p style={styles.subtitle}>Welcome back, <strong style={{color:'#f5a623'}}>{username}</strong>!</p>
        <div style={styles.homeCard} onClick={() => setScreen('roomSelect')}>
          <div style={styles.homeCardIcon}>💬</div>
          <div style={styles.homeCardInfo}>
            <div style={styles.homeCardTitle}>Group Chat</div>
            <div style={styles.homeCardSub}>Join public rooms • Real-time • Auto-delete 5min • Media sharing</div>
          </div>
          <span style={styles.homeCardArrow}>→</span>
        </div>
        <div style={styles.homeCard} onClick={() => { fetchConversations(username); initSocket(username); setScreen('users'); }}>
          <div style={{...styles.homeCardIcon, background: 'linear-gradient(135deg, #51cf66, #2f9e44)'}}>🔐</div>
          <div style={styles.homeCardInfo}>
            <div style={styles.homeCardTitle}>
              Private Messages
              {totalUnread > 0 && <span style={styles.homeBadge}>{totalUnread}</span>}
            </div>
            <div style={styles.homeCardSub}>E2E Encrypted • Auto-delete 5min • Media sharing</div>
          </div>
          <span style={styles.homeCardArrow}>→</span>
        </div>
        <button style={styles.logoutBtn} onClick={handleLogout}>Sign Out</button>
      </div>
    </div>
  );

  // ─── ROOM SELECT ───
  if (screen === 'roomSelect') return (
    <div style={styles.authContainer}>
      <style>{CSS}</style>
      <div style={styles.authBox}>
        <button style={styles.backBtnFull} onClick={() => setScreen('home')}>← Back</button>
        <div style={styles.logoContainer}><span style={styles.logoIcon}>💬</span><h1 style={styles.logo}>Group Chat</h1></div>
        <p style={styles.subtitle}>Select a room to join</p>
        <div style={styles.inputGroup}><label style={styles.label}>Select Room</label>
          <select style={styles.select} value={room} onChange={e => setRoom(e.target.value)}>
            <option value="general">💬 General</option>
            <option value="tech">💻 Tech Talk</option>
            <option value="cloud">☁️ Cloud Engineering</option>
            <option value="random">🎲 Random</option>
          </select>
        </div>
        <button style={styles.primaryBtn} onClick={joinGroupChat}>Join #{room} →</button>
      </div>
    </div>
  );

  // ─── DM LIST ───
  if (screen === 'users') return (
    <div style={styles.chatContainer}>
      <style>{CSS}</style>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => setScreen('home')}>←</button>
          <span style={styles.headerIcon}>🔐</span>
          <div><h2 style={styles.headerTitle}>Private Messages</h2><p style={styles.headerSub}>🔒 E2E Encrypted</p></div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.userBadge}>👤 {username}</div>
          <button style={styles.logoutBtn2} onClick={handleLogout}>⏻</button>
        </div>
      </div>
      <div style={styles.searchContainer}>
        <input style={styles.searchInput} placeholder="🔍 Search users to start a new chat..."
          value={searchQuery} onChange={e => handleSearch(e.target.value)} />
      </div>
      <div style={styles.dmListContainer}>
        {searchQuery.length > 0 ? (
          <div>
            <p style={styles.sectionTitle}>Search Results</p>
            {searchResults.length === 0 && <p style={styles.noResults}>No users found for "{searchQuery}"</p>}
            {searchResults.filter(u => u.username !== username).map((u, i) => (
              <div key={i} style={styles.convCard} onClick={() => openPrivateChat(u.username)}>
                <div style={{...styles.convAvatar, position: 'relative'}}>
                  {u.username.charAt(0).toUpperCase()}<OnlineDot isOnline={isOnline(u.username)} />
                </div>
                <div style={styles.convInfo}>
                  <div style={styles.convHeader}>
                    <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                      <span style={styles.convName}>{u.username}</span>
                      <span style={{fontSize:'9px', color: isOnline(u.username) ? '#51cf66' : '#666'}}>
                        {isOnline(u.username) ? '● online' : '○ offline'}
                      </span>
                    </div>
                  </div>
                  <div style={styles.convLastMsg}>🔒 Tap to start encrypted chat</div>
                </div>
                <span style={styles.dmStartBtn}>DM</span>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {conversations.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>🔐</div>
                <p style={styles.emptyText}>No conversations yet</p>
                <p style={styles.emptySubtext}>Search for a user above to start chatting</p>
              </div>
            ) : (
              <div>
                <p style={styles.sectionTitle}>Conversations</p>
                {conversations.map((conv, i) => {
                  const other = getOtherParticipant(conv);
                  const unread = getUnreadCount(conv);
                  return (
                    <div key={i} style={{...styles.convCard, ...(unread > 0 ? styles.convCardUnread : {})}}
                      onClick={() => openPrivateChat(other)}>
                      <div style={{...styles.convAvatar, position: 'relative'}}>
                        {other.charAt(0).toUpperCase()}<OnlineDot isOnline={isOnline(other)} />
                      </div>
                      <div style={styles.convInfo}>
                        <div style={styles.convHeader}>
                          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                            <span style={{...styles.convName, fontWeight: unread > 0 ? '800' : '600'}}>{other}</span>
                            <span style={{fontSize:'9px', color: isOnline(other) ? '#51cf66' : '#666'}}>
                              {isOnline(other) ? '● online' : '○ offline'}
                            </span>
                          </div>
                          <span style={styles.convTime}>{formatTime(conv.lastMessageTime)}</span>
                        </div>
                        <div style={styles.convFooter}>
                          {unread > 0 ? (
                            <span style={{...styles.convLastMsg, color: '#51cf66', fontWeight: '600'}}>
                              🔒 {unread} new message{unread > 1 ? 's' : ''}
                            </span>
                          ) : conv.lastMessageFrom === username ? (
                            <span style={styles.convLastMsg}>✓ You sent a message</span>
                          ) : (
                            <span style={styles.convLastMsg}>🔒 Encrypted message</span>
                          )}
                          {unread > 0 && <span style={styles.unreadBadge}>{unread}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ─── PRIVATE CHAT ───
  if (screen === 'private') return (
    <div style={styles.chatContainer}>
      <style>{CSS}</style>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => setScreen('users')}>←</button>
          <div style={{...styles.convAvatar, position: 'relative'}}>
            {privateUser.charAt(0).toUpperCase()}<OnlineDot isOnline={isOnline(privateUser)} />
          </div>
          <div>
            <h2 style={styles.headerTitle}>{privateUser}</h2>
            <p style={styles.headerSub}>
              <span style={{color: isOnline(privateUser) ? '#51cf66' : '#888'}}>
                {isOnline(privateUser) ? '● Online' : '○ Offline'}
              </span>
              {' • '}🔒 E2E • 5min delete
            </p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.logoutBtn2} onClick={handleLogout}>⏻</button>
        </div>
      </div>
      <div style={styles.privateBanner}>🔐 AES-256 • 🕐 5min auto-delete after reading • 👁️ Only you & {privateUser}</div>
      <div style={styles.messagesContainer}>
        {privateMessages.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>🔐</div>
            <p style={styles.emptyText}>Encrypted Chat</p>
            <p style={styles.emptySubtext}>5min countdown starts when recipient reads</p>
          </div>
        )}
        {privateMessages.map((m, i) => (
          <div key={i} style={m.from === username ? styles.myMessageWrapper : styles.otherMessageWrapper}>
            {m.from !== username && <div style={styles.avatarSmall}>{m.from.charAt(0).toUpperCase()}</div>}
            <div style={styles.messageContent}>
              {m.from !== username && <div style={styles.msgUsername}>{m.from}</div>}
              <div style={{...(m.from === username ? styles.myBubble : styles.otherBubble), opacity: m.temp ? 0.7 : 1}}>
                {m.fileUrl ? renderMedia(m) : `🔒 ${m.message}`}
              </div>
              <div style={styles.msgTime}>
                {m.temp ? '⏳ sending...' : new Date(m.timestamp).toLocaleTimeString()}
                {m.expiresAt && !m.temp && <span style={styles.expiryText}> • 🔥 {new Date(m.expiresAt).toLocaleTimeString()}</span>}
              </div>
            </div>
            {m.from === username && <div style={styles.avatarMeSmall}>{username.charAt(0).toUpperCase()}</div>}
          </div>
        ))}
        <div ref={privateBottomRef} />
      </div>
      {privateTyping && <div style={styles.typingIndicator}><span style={styles.typingDots}>•••</span> {privateTyping}</div>}
      <div style={styles.inputContainer}>
        <input type="file" ref={privateFileInputRef} onChange={e => handleFileUpload(e, true)}
          accept="image/*,video/*,audio/*" style={{ display: 'none' }} />
        <button style={styles.attachBtn} onClick={() => privateFileInputRef.current.click()} disabled={privateUploading}>
          {privateUploading ? '⏳' : '📎'}
        </button>
        <input style={styles.messageInput} placeholder="Encrypted message..."
          value={privateMessage} onChange={handlePrivateTyping}
          onKeyDown={e => e.key === 'Enter' && sendPrivateMessage()} />
        <button style={privateMessage.trim() ? styles.sendBtn : styles.sendBtnDisabled}
          onClick={sendPrivateMessage} disabled={!privateMessage.trim()}>🔒</button>
      </div>
    </div>
  );

  // ─── MAIN CHAT ───
  return (
    <div style={styles.chatContainer}>
      <style>{CSS}</style>
      {notification && (
        <div style={styles.notificationBanner} onClick={() => { setScreen('users'); setNotification(''); }}>
          {notification} — tap to view
        </div>
      )}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={leaveRoom}>←</button>
          <span style={styles.headerIcon}>💬</span>
          <div><h2 style={styles.headerTitle}>#{room}</h2><p style={styles.headerSub}>CloudChat</p></div>
        </div>
        <div style={styles.headerRight}>
          <span style={connected ? styles.dotGreen : styles.dotRed}>●</span>
          <button style={styles.privateBtn} onClick={() => { fetchConversations(username); setScreen('users'); }}>
            🔐 {totalUnread > 0 && <span style={styles.unreadBadgeSmall}>{totalUnread}</span>}
          </button>
          <button style={styles.logoutBtn2} onClick={handleLogout}>⏻</button>
        </div>
      </div>
      <div style={styles.infoBar}>
        <span>⚡ WS</span><span>🔴 Redis</span><span>🍃 MongoDB</span>
        <span>🐳 Docker</span><span>🔐 JWT</span><span>🔒 E2E</span><span>📎 Media</span>
        <span style={styles.onlineCount}>🟢 {onlineUsers}</span>
      </div>
      <div style={styles.messagesContainer}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>💬</div>
            <p style={styles.emptyText}>No messages yet</p>
            <p style={styles.emptySubtext}>Be the first to say hello!</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={m.username === username ? styles.myMessageWrapper : styles.otherMessageWrapper}>
            {m.username !== username && (
              <div style={{...styles.avatarSmall, position: 'relative'}} onClick={() => openPrivateChat(m.username)}>
                {m.username.charAt(0).toUpperCase()}<OnlineDot isOnline={isOnline(m.username)} />
              </div>
            )}
            <div style={styles.messageContent}>
              {m.username !== username && (
                <div style={styles.msgUsername} onClick={() => openPrivateChat(m.username)}>
                  {m.username}
                  <span style={{...styles.dmHint, color: isOnline(m.username) ? '#51cf66' : '#888'}}>
                    {isOnline(m.username) ? ' ● online' : ' ○ offline'}
                  </span>
                </div>
              )}
              <div style={m.username === username ? styles.myBubble : styles.otherBubble}>
                {m.fileUrl ? renderMedia(m) : m.message}
              </div>
              <div style={styles.msgTime}>
                {new Date(m.timestamp).toLocaleTimeString()}
                {m.expiresAt && <span style={styles.expiryText}> 🔥 {new Date(m.expiresAt).toLocaleTimeString()}</span>}
              </div>
            </div>
            {m.username === username && <div style={styles.avatarMeSmall}>{username.charAt(0).toUpperCase()}</div>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {typing && <div style={styles.typingIndicator}><span style={styles.typingDots}>•••</span> {typing}</div>}
      <div style={styles.inputContainer}>
        <input type="file" ref={fileInputRef} onChange={e => handleFileUpload(e, false)}
          accept="image/*,video/*,audio/*" style={{ display: 'none' }} />
        <button style={styles.attachBtn} onClick={() => fileInputRef.current.click()} disabled={uploading}>
          {uploading ? '⏳' : '📎'}
        </button>
        <input style={styles.messageInput} placeholder={`Message #${room}...`}
          value={message} onChange={handleTyping}
          onKeyDown={e => e.key === 'Enter' && sendMessage()} />
        <button style={message.trim() ? styles.sendBtn : styles.sendBtnDisabled}
          onClick={sendMessage} disabled={!message.trim()}>➤</button>
      </div>
    </div>
  );
}

const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
`;

const styles = {
  authContainer: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)', padding: '16px',
  },
  authBox: {
    background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
    padding: '32px 24px', width: '100%', maxWidth: '420px',
    display: 'flex', flexDirection: 'column', gap: '16px',
    boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
  },
  logoContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' },
  logoIcon: { fontSize: '32px' },
  logo: {
    color: '#fff', margin: 0, fontSize: '28px', fontWeight: '800',
    background: 'linear-gradient(135deg, #f5a623, #f0532a)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  subtitle: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: 0, fontSize: '14px' },
  errorBox: {
    background: 'rgba(255,107,107,0.2)', border: '1px solid rgba(255,107,107,0.4)',
    borderRadius: '8px', padding: '10px 14px', color: '#ff6b6b', fontSize: '13px',
  },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' },
  input: {
    padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '16px', outline: 'none', width: '100%',
  },
  select: {
    padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)',
    background: '#1a1a3e', color: '#fff', fontSize: '16px', outline: 'none', width: '100%',
  },
  primaryBtn: {
    padding: '16px', background: 'linear-gradient(135deg, #f5a623, #f0532a)',
    border: 'none', borderRadius: '12px', color: '#fff', fontSize: '16px',
    fontWeight: 'bold', cursor: 'pointer', width: '100%',
  },
  googleBtn: {
    padding: '14px', background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px',
    color: '#fff', fontSize: '15px', cursor: 'pointer', width: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
  },
  googleIcon: {
    background: '#fff', color: '#4285f4', width: '24px', height: '24px',
    borderRadius: '50%', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 'bold', fontSize: '14px',
  },
  divider: { display: 'flex', alignItems: 'center', gap: '12px', color: 'rgba(255,255,255,0.3)', fontSize: '13px' },
  switchText: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: '13px', margin: 0 },
  switchLink: { color: '#f5a623', cursor: 'pointer', fontWeight: '600' },
  logoutBtn: {
    padding: '12px', background: 'transparent',
    border: '1px solid rgba(255,107,107,0.3)', borderRadius: '12px',
    color: '#ff6b6b', fontSize: '14px', cursor: 'pointer', width: '100%',
  },
  homeCard: {
    display: 'flex', alignItems: 'center', gap: '16px',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '16px', padding: '18px 20px', cursor: 'pointer',
  },
  homeCardIcon: {
    width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0,
    background: 'linear-gradient(135deg, #f5a623, #f0532a)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px',
  },
  homeCardInfo: { flex: 1 },
  homeCardTitle: { color: '#fff', fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' },
  homeCardSub: { color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginTop: '4px' },
  homeCardArrow: { color: 'rgba(255,255,255,0.3)', fontSize: '20px' },
  homeBadge: {
    background: '#ff6b6b', color: '#fff', borderRadius: '10px',
    padding: '2px 7px', fontSize: '11px', fontWeight: 'bold',
  },
  backBtnFull: {
    background: 'transparent', border: 'none', color: '#f5a623',
    fontSize: '14px', cursor: 'pointer', textAlign: 'left', padding: '0',
  },
  chatContainer: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0c29', overflow: 'hidden' },
  header: {
    background: 'linear-gradient(135deg, #302b63, #0f0c29)', padding: '10px 16px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.08)', minHeight: '56px', flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  headerIcon: { fontSize: '24px' },
  headerTitle: { color: '#fff', margin: 0, fontSize: '16px', fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.4)', margin: 0, fontSize: '10px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  dotGreen: { color: '#51cf66', fontSize: '12px' },
  dotRed: { color: '#ff6b6b', fontSize: '12px' },
  userBadge: {
    background: 'rgba(245,166,35,0.2)', border: '1px solid rgba(245,166,35,0.3)',
    borderRadius: '20px', padding: '4px 10px', color: '#f5a623', fontSize: '12px', fontWeight: '600',
  },
  backBtn: {
    background: 'transparent', border: 'none', color: '#f5a623',
    fontSize: '20px', cursor: 'pointer', padding: '4px 8px',
  },
  privateBtn: {
    background: 'rgba(81,207,102,0.2)', border: '1px solid rgba(81,207,102,0.3)',
    borderRadius: '8px', padding: '6px 12px', color: '#51cf66', fontSize: '14px',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
  },
  unreadBadgeSmall: {
    background: '#ff6b6b', color: '#fff', borderRadius: '10px',
    padding: '1px 5px', fontSize: '10px', fontWeight: 'bold',
  },
  logoutBtn2: {
    background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px', padding: '6px 10px', color: 'rgba(255,255,255,0.5)',
    fontSize: '14px', cursor: 'pointer',
  },
  privateBanner: {
    background: 'rgba(81,207,102,0.1)', borderBottom: '1px solid rgba(81,207,102,0.2)',
    padding: '6px 16px', fontSize: '11px', color: '#51cf66', textAlign: 'center', flexShrink: 0,
  },
  notificationBanner: {
    background: 'linear-gradient(135deg, #51cf66, #2f9e44)', padding: '10px 16px',
    fontSize: '13px', color: '#fff', textAlign: 'center', fontWeight: '600',
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, cursor: 'pointer',
  },
  infoBar: {
    background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '6px 16px', display: 'flex', gap: '12px', fontSize: '11px',
    color: 'rgba(255,255,255,0.4)', overflowX: 'auto', flexShrink: 0,
  },
  onlineCount: { marginLeft: 'auto', color: '#51cf66', whiteSpace: 'nowrap' },
  searchContainer: {
    padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)', flexShrink: 0,
  },
  searchInput: {
    width: '100%', padding: '10px 16px', borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)',
    color: '#fff', fontSize: '15px', outline: 'none',
  },
  dmListContainer: { flex: 1, overflowY: 'auto', padding: '12px 16px' },
  sectionTitle: {
    color: 'rgba(255,255,255,0.35)', fontSize: '11px', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: '1px', margin: '12px 0 8px 0',
  },
  noResults: { color: 'rgba(255,255,255,0.3)', fontSize: '14px', textAlign: 'center', padding: '20px 0' },
  convCard: {
    display: 'flex', alignItems: 'center', gap: '12px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '16px', padding: '12px 14px', cursor: 'pointer', marginBottom: '8px',
  },
  convCardUnread: { background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)' },
  convAvatar: {
    width: '44px', height: '44px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #302b63, #24243e)',
    border: '2px solid rgba(255,255,255,0.15)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', color: '#fff',
    fontSize: '18px', fontWeight: 'bold', flexShrink: 0,
  },
  convInfo: { flex: 1, minWidth: 0 },
  convHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' },
  convName: { color: '#fff', fontSize: '14px', fontWeight: '600' },
  convTime: { color: 'rgba(255,255,255,0.3)', fontSize: '11px', flexShrink: 0 },
  convFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  convLastMsg: { color: 'rgba(255,255,255,0.4)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  unreadBadge: {
    background: '#f5a623', color: '#fff', borderRadius: '10px',
    padding: '2px 7px', fontSize: '11px', fontWeight: 'bold', flexShrink: 0, marginLeft: '8px',
  },
  dmStartBtn: {
    background: 'rgba(81,207,102,0.2)', border: '1px solid rgba(81,207,102,0.3)',
    borderRadius: '8px', padding: '5px 10px', color: '#51cf66', fontSize: '12px', cursor: 'pointer', flexShrink: 0,
  },
  onlineStatusText: { fontSize: '10px', fontWeight: '600', flexShrink: 0 },
  messagesContainer: { flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '8px', marginTop: '60px' },
  emptyIcon: { fontSize: '48px', opacity: 0.3 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: '16px', margin: 0 },
  emptySubtext: { color: 'rgba(255,255,255,0.2)', fontSize: '13px', margin: 0 },
  myMessageWrapper: { display: 'flex', alignItems: 'flex-end', gap: '6px', justifyContent: 'flex-end' },
  otherMessageWrapper: { display: 'flex', alignItems: 'flex-end', gap: '6px', justifyContent: 'flex-start' },
  avatarSmall: {
    width: '28px', height: '28px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #302b63, #24243e)',
    border: '2px solid rgba(255,255,255,0.15)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', color: '#fff',
    fontSize: '12px', fontWeight: 'bold', flexShrink: 0, cursor: 'pointer',
  },
  avatarMeSmall: {
    width: '28px', height: '28px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #f5a623, #f0532a)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '12px', fontWeight: 'bold', flexShrink: 0,
  },
  messageContent: { maxWidth: '75%' },
  msgUsername: { color: '#f5a623', fontSize: '11px', marginBottom: '3px', fontWeight: '600', cursor: 'pointer' },
  dmHint: { fontSize: '9px', marginLeft: '4px' },
  myBubble: {
    background: 'linear-gradient(135deg, #f5a623, #f0532a)', color: '#fff',
    padding: '10px 14px', borderRadius: '18px 18px 4px 18px', fontSize: '14px', lineHeight: '1.5', wordBreak: 'break-word',
  },
  otherBubble: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff', padding: '10px 14px', borderRadius: '18px 18px 18px 4px', fontSize: '14px', lineHeight: '1.5', wordBreak: 'break-word',
  },
  msgTime: { color: 'rgba(255,255,255,0.25)', fontSize: '10px', marginTop: '3px', textAlign: 'right' },
  expiryText: { color: '#ff6b6b', fontSize: '9px' },
  typingIndicator: { color: 'rgba(255,255,255,0.4)', fontSize: '12px', padding: '4px 16px 6px', fontStyle: 'italic', flexShrink: 0 },
  typingDots: { color: '#f5a623' },
  inputContainer: {
    display: 'flex', gap: '8px', padding: '10px 16px 16px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)', alignItems: 'center', flexShrink: 0,
  },
  messageInput: {
    flex: 1, padding: '12px 16px', borderRadius: '25px',
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)',
    color: '#fff', fontSize: '15px', outline: 'none',
  },
  attachBtn: {
    width: '44px', height: '44px', background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%',
    color: '#fff', fontSize: '18px', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  sendBtn: {
    width: '44px', height: '44px', background: 'linear-gradient(135deg, #f5a623, #f0532a)',
    border: 'none', borderRadius: '50%', color: '#fff', fontWeight: 'bold',
    cursor: 'pointer', fontSize: '16px', flexShrink: 0,
  },
  sendBtnDisabled: {
    width: '44px', height: '44px', background: 'rgba(255,255,255,0.1)',
    border: 'none', borderRadius: '50%', color: 'rgba(255,255,255,0.3)',
    cursor: 'not-allowed', fontSize: '16px', flexShrink: 0,
  },
  mediaImage: { maxWidth: '100%', maxHeight: '250px', borderRadius: '12px', cursor: 'pointer', display: 'block' },
  mediaVideo: { maxWidth: '100%', maxHeight: '250px', borderRadius: '12px', display: 'block' },
  mediaAudio: { width: '100%', borderRadius: '12px' },
  fileLink: { color: '#f5a623', textDecoration: 'none', fontWeight: '600' },
};

export default App;