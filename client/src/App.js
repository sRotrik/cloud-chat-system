import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';

function App() {
  const [screen, setScreen] = useState('login'); // login, register, chat
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [room, setRoom] = useState('general');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [joined, setJoined] = useState(false);
  const [typing, setTyping] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);

  // Check token on load
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUsername = localStorage.getItem('username');
    if (savedToken && savedUsername) {
      setToken(savedToken);
      setUsername(savedUsername);
      setScreen('room');
    }

    // Handle Google OAuth redirect
    const params = new URLSearchParams(window.location.search);
    const googleToken = params.get('token');
    const googleUsername = params.get('username');
    if (googleToken && googleUsername) {
      localStorage.setItem('token', googleToken);
      localStorage.setItem('username', googleUsername);
      setToken(googleToken);
      setUsername(googleUsername);
      setScreen('room');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleRegister = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.user.username);
      setToken(data.token);
      setUsername(data.user.username);
      setScreen('room');
    } catch (err) {
      setError('Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.user.username);
      setToken(data.token);
      setUsername(data.user.username);
      setScreen('room');
    } catch (err) {
      setError('Login failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${SERVER}/auth/google`;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setToken('');
    setUsername('');
    setJoined(false);
    setMessages([]);
    setScreen('login');
    if (socketRef.current) socketRef.current.disconnect();
  };

  const joinRoom = () => {
    setJoined(true);
    const socket = io(SERVER, {
      auth: { token },
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.emit('join_room', room);
    socket.on('message_history', (history) => setMessages(history));
    socket.on('receive_message', (msg) => setMessages(prev => [...prev, msg]));
    socket.on('user_typing', (user) => {
      setTyping(`${user} is typing...`);
      setTimeout(() => setTyping(''), 2000);
    });
    socket.on('online_count', (count) => setOnlineUsers(count));
  };

  const sendMessage = () => {
    if (message.trim() && socketRef.current) {
      socketRef.current.emit('send_message', { room, username, message });
      setMessage('');
    }
  };

  const handleTyping = (e) => {
    setMessage(e.target.value);
    if (socketRef.current) socketRef.current.emit('typing', { room, username });
  };

  const leaveRoom = () => {
    if (socketRef.current) socketRef.current.disconnect();
    setJoined(false);
    setMessages([]);
    setScreen('room');
  };

  // LOGIN SCREEN
  if (screen === 'login') {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authBox}>
          <div style={styles.logoContainer}>
            <span style={styles.logoIcon}>☁️</span>
            <h1 style={styles.logo}>CloudChat</h1>
          </div>
          <p style={styles.subtitle}>Sign in to continue</p>

          {error && <div style={styles.errorBox}>{error}</div>}

          <div style={styles.inputGroup}>
            <label style={styles.label}>Email</label>
            <input style={styles.input} type="email" placeholder="your@email.com"
              value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input style={styles.input} type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>

          <button style={styles.primaryBtn} onClick={handleLogin} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>

          <div style={styles.divider}><span>or</span></div>

          <button style={styles.googleBtn} onClick={handleGoogleLogin}>
            <span style={styles.googleIcon}>G</span> Continue with Google
          </button>

          <p style={styles.switchText}>
            Don't have an account?{' '}
            <span style={styles.switchLink} onClick={() => { setScreen('register'); setError(''); }}>
              Register
            </span>
          </p>
        </div>
      </div>
    );
  }

  // REGISTER SCREEN
  if (screen === 'register') {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authBox}>
          <div style={styles.logoContainer}>
            <span style={styles.logoIcon}>☁️</span>
            <h1 style={styles.logo}>CloudChat</h1>
          </div>
          <p style={styles.subtitle}>Create your account</p>

          {error && <div style={styles.errorBox}>{error}</div>}

          <div style={styles.inputGroup}>
            <label style={styles.label}>Username</label>
            <input style={styles.input} placeholder="cooluser123"
              value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Email</label>
            <input style={styles.input} type="email" placeholder="your@email.com"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input style={styles.input} type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          <button style={styles.primaryBtn} onClick={handleRegister} disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account →'}
          </button>

          <div style={styles.divider}><span>or</span></div>

          <button style={styles.googleBtn} onClick={handleGoogleLogin}>
            <span style={styles.googleIcon}>G</span> Continue with Google
          </button>

          <p style={styles.switchText}>
            Already have an account?{' '}
            <span style={styles.switchLink} onClick={() => { setScreen('login'); setError(''); }}>
              Sign In
            </span>
          </p>
        </div>
      </div>
    );
  }

  // ROOM SELECT SCREEN
  if (screen === 'room') {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authBox}>
          <div style={styles.logoContainer}>
            <span style={styles.logoIcon}>☁️</span>
            <h1 style={styles.logo}>CloudChat</h1>
          </div>
          <p style={styles.subtitle}>Welcome back, <strong style={{color:'#f5a623'}}>{username}</strong>!</p>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Select Room</label>
            <select style={styles.select} value={room} onChange={e => setRoom(e.target.value)}>
              <option value="general">💬 General</option>
              <option value="tech">💻 Tech Talk</option>
              <option value="cloud">☁️ Cloud Engineering</option>
              <option value="random">🎲 Random</option>
            </select>
          </div>

          <button style={styles.primaryBtn} onClick={joinRoom}>
            Join #{room} →
          </button>

          <button style={styles.logoutBtn} onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // CHAT SCREEN
  return (
    <div style={styles.chatContainer}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>☁️</span>
          <div>
            <h2 style={styles.headerTitle}>#{room}</h2>
            <p style={styles.headerSub}>Cloud-Native Chat System</p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.statusBadge}>
            <span style={connected ? styles.dotGreen : styles.dotRed}>●</span>
            <span style={styles.statusText}>{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div style={styles.userBadge}>👤 {username}</div>
          <button style={styles.leaveBtn} onClick={leaveRoom}>Leave</button>
          <button style={styles.logoutBtn2} onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div style={styles.infoBar}>
        <span>⚡ WebSocket</span>
        <span>🔴 Redis Pub/Sub</span>
        <span>🍃 MongoDB</span>
        <span>🐳 Docker</span>
        <span>🔐 JWT Auth</span>
        <span style={styles.onlineCount}>🟢 {onlineUsers} online</span>
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
              <div style={styles.avatar}>{m.username.charAt(0).toUpperCase()}</div>
            )}
            <div style={styles.messageContent}>
              {m.username !== username && <div style={styles.msgUsername}>{m.username}</div>}
              <div style={m.username === username ? styles.myBubble : styles.otherBubble}>
                {m.message}
              </div>
              <div style={styles.msgTime}>{new Date(m.timestamp).toLocaleTimeString()}</div>
            </div>
            {m.username === username && (
              <div style={styles.avatarMe}>{username.charAt(0).toUpperCase()}</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {typing && (
        <div style={styles.typingIndicator}>
          <span style={styles.typingDots}>•••</span> {typing}
        </div>
      )}

      <div style={styles.inputContainer}>
        <input style={styles.messageInput}
          placeholder={`Message #${room}...`}
          value={message} onChange={handleTyping}
          onKeyDown={e => e.key === 'Enter' && sendMessage()} />
        <button style={message.trim() ? styles.sendBtn : styles.sendBtnDisabled}
          onClick={sendMessage} disabled={!message.trim()}>➤</button>
      </div>
    </div>
  );
}

const styles = {
  authContainer: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  },
  authBox: {
    background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
    padding: '48px 40px', width: '420px', display: 'flex',
    flexDirection: 'column', gap: '16px',
    boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
  },
  logoContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' },
  logoIcon: { fontSize: '36px' },
  logo: {
    color: '#fff', margin: 0, fontSize: '32px', fontWeight: '800',
    background: 'linear-gradient(135deg, #f5a623, #f0532a)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  subtitle: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: 0, fontSize: '14px' },
  errorBox: {
    background: 'rgba(255,107,107,0.2)', border: '1px solid rgba(255,107,107,0.4)',
    borderRadius: '8px', padding: '10px 14px', color: '#ff6b6b', fontSize: '13px',
  },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' },
  input: {
    padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '15px',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  select: {
    padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)',
    background: '#1a1a3e', color: '#fff', fontSize: '15px', outline: 'none',
    width: '100%', boxSizing: 'border-box',
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
    borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 'bold', fontSize: '14px',
    lineHeight: '24px', textAlign: 'center',
  },
  divider: {
    display: 'flex', alignItems: 'center', gap: '12px',
    color: 'rgba(255,255,255,0.3)', fontSize: '13px',
    '::before': { content: '""', flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' },
  },
  switchText: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: '13px', margin: 0 },
  switchLink: { color: '#f5a623', cursor: 'pointer', fontWeight: '600' },
  logoutBtn: {
    padding: '12px', background: 'transparent',
    border: '1px solid rgba(255,107,107,0.3)', borderRadius: '12px',
    color: '#ff6b6b', fontSize: '14px', cursor: 'pointer', width: '100%',
  },
  chatContainer: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0c29' },
  header: {
    background: 'linear-gradient(135deg, #302b63, #0f0c29)', padding: '14px 24px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  headerIcon: { fontSize: '28px' },
  headerTitle: { color: '#fff', margin: 0, fontSize: '18px', fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.4)', margin: 0, fontSize: '11px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  statusBadge: {
    display: 'flex', alignItems: 'center', gap: '6px',
    background: 'rgba(255,255,255,0.08)', borderRadius: '20px', padding: '6px 12px',
  },
  dotGreen: { color: '#51cf66', fontSize: '10px' },
  dotRed: { color: '#ff6b6b', fontSize: '10px' },
  statusText: { color: 'rgba(255,255,255,0.7)', fontSize: '12px' },
  userBadge: {
    background: 'rgba(245,166,35,0.2)', border: '1px solid rgba(245,166,35,0.3)',
    borderRadius: '20px', padding: '6px 14px', color: '#f5a623', fontSize: '13px', fontWeight: '600',
  },
  leaveBtn: {
    background: 'rgba(255,107,107,0.2)', border: '1px solid rgba(255,107,107,0.3)',
    borderRadius: '8px', padding: '6px 14px', color: '#ff6b6b', fontSize: '13px', cursor: 'pointer',
  },
  logoutBtn2: {
    background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px', padding: '6px 14px', color: 'rgba(255,255,255,0.5)',
    fontSize: '13px', cursor: 'pointer',
  },
  infoBar: {
    background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '8px 24px', display: 'flex', gap: '24px',
    fontSize: '12px', color: 'rgba(255,255,255,0.4)',
  },
  onlineCount: { marginLeft: 'auto', color: '#51cf66' },
  messagesContainer: { flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '8px', marginTop: '80px' },
  emptyIcon: { fontSize: '48px', opacity: 0.3 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: '18px', margin: 0 },
  emptySubtext: { color: 'rgba(255,255,255,0.2)', fontSize: '14px', margin: 0 },
  myMessageWrapper: { display: 'flex', alignItems: 'flex-end', gap: '8px', justifyContent: 'flex-end' },
  otherMessageWrapper: { display: 'flex', alignItems: 'flex-end', gap: '8px', justifyContent: 'flex-start' },
  avatar: {
    width: '32px', height: '32px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #302b63, #24243e)',
    border: '2px solid rgba(255,255,255,0.2)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', color: '#fff',
    fontSize: '13px', fontWeight: 'bold', flexShrink: 0,
  },
  avatarMe: {
    width: '32px', height: '32px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #f5a623, #f0532a)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '13px', fontWeight: 'bold', flexShrink: 0,
  },
  messageContent: { maxWidth: '65%' },
  msgUsername: { color: '#f5a623', fontSize: '12px', marginBottom: '4px', fontWeight: '600' },
  myBubble: {
    background: 'linear-gradient(135deg, #f5a623, #f0532a)', color: '#fff',
    padding: '12px 16px', borderRadius: '18px 18px 4px 18px', fontSize: '14px', lineHeight: '1.5',
  },
  otherBubble: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff', padding: '12px 16px', borderRadius: '18px 18px 18px 4px',
    fontSize: '14px', lineHeight: '1.5',
  },
  msgTime: { color: 'rgba(255,255,255,0.25)', fontSize: '11px', marginTop: '4px', textAlign: 'right' },
  typingIndicator: { color: 'rgba(255,255,255,0.4)', fontSize: '12px', padding: '4px 24px 8px', fontStyle: 'italic' },
  typingDots: { color: '#f5a623' },
  inputContainer: {
    display: 'flex', gap: '12px', padding: '16px 24px 24px',
    borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)',
  },
  messageInput: {
    flex: 1, padding: '14px 20px', borderRadius: '25px',
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)',
    color: '#fff', fontSize: '14px', outline: 'none',
  },
  sendBtn: {
    width: '48px', height: '48px', background: 'linear-gradient(135deg, #f5a623, #f0532a)',
    border: 'none', borderRadius: '50%', color: '#fff', fontWeight: 'bold',
    cursor: 'pointer', fontSize: '18px',
  },
  sendBtnDisabled: {
    width: '48px', height: '48px', background: 'rgba(255,255,255,0.1)',
    border: 'none', borderRadius: '50%', color: 'rgba(255,255,255,0.3)',
    cursor: 'not-allowed', fontSize: '18px',
  },
};

export default App;