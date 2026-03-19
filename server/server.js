const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('ENV CHECK - MONGO_URI:', process.env.MONGO_URI);
console.log('ENV CHECK - PORT:', process.env.PORT);
console.log('ENV CHECK - REDIS_URL:', process.env.REDIS_URL ? '✅ Found' : '❌ Missing');

const MONGO = process.env.MONGO_URI;
const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL;

const app = express();
app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const { router: privateRoutes, encryptMessage, getSharedKey, getRoomId } = require('./routes/private');
app.use('/auth', authRoutes);
app.use('/private', privateRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Redis
const pubClient = createClient({
  url: REDIS_URL,
  socket: { tls: true, rejectUnauthorized: false, connectTimeout: 30000 }
});
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()])
  .then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Redis Adapter Connected');
  })
  .catch(err => console.log('❌ Redis Error:', err.message));

mongoose.connect(MONGO)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ MongoDB Error:', err.message));

// Models
const MessageSchema = new mongoose.Schema({
  room: String,
  username: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);
const PrivateMessage = require('./models/PrivateMessage');

// Track online users
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Public room chat
  socket.on('join_room', async (room) => {
    socket.join(room);
    const history = await Message.find({ room })
      .sort('-timestamp').limit(50);
    socket.emit('message_history', history.reverse());
    io.to(room).emit('online_count',
      io.sockets.adapter.rooms.get(room)?.size || 0);
  });

  socket.on('send_message', async (data) => {
    const msg = new Message(data);
    await msg.save();
    io.to(data.room).emit('receive_message', {
      username: data.username,
      message: data.message,
      timestamp: msg.timestamp
    });
  });

  socket.on('typing', (data) => {
    socket.to(data.room).emit('user_typing', data.username);
  });

  // Private chat
  socket.on('join_private', async ({ from, to }) => {
    const roomId = getRoomId(from, to);
    socket.join(`private_${roomId}`);
    onlineUsers.set(from, socket.id);

    // Load history
    const key = getSharedKey(from, to);
    const messages = await PrivateMessage.find({ roomId })
      .sort('timestamp').limit(50);

    const decrypted = messages.map(msg => {
      try {
        const [ivHex, encrypted] = msg.encryptedMessage.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(
          'aes-256-cbc', Buffer.from(key), iv
        );
        let text = decipher.update(encrypted, 'hex', 'utf8');
        text += decipher.final('utf8');
        return {
          from: msg.from,
          to: msg.to,
          message: text,
          timestamp: msg.timestamp,
          expiresAt: msg.expiresAt,
        };
      } catch {
        return {
          from: msg.from,
          to: msg.to,
          message: '[Encrypted]',
          timestamp: msg.timestamp,
        };
      }
    });

    socket.emit('private_history', decrypted);
  });

  socket.on('send_private', async ({ from, to, message }) => {
    const roomId = getRoomId(from, to);
    const key = getSharedKey(from, to);

    // Encrypt
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const encryptedMessage = iv.toString('hex') + ':' + encrypted;

    // Save with 10 min expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const msg = new PrivateMessage({ from, to, encryptedMessage, roomId, expiresAt });
    await msg.save();

    // Send decrypted to both users
    io.to(`private_${roomId}`).emit('receive_private', {
      from,
      to,
      message,
      timestamp: msg.timestamp,
      expiresAt,
    });
  });

  socket.on('private_typing', ({ from, to }) => {
    const roomId = getRoomId(from, to);
    socket.to(`private_${roomId}`).emit('private_user_typing', from);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    onlineUsers.forEach((id, username) => {
      if (id === socket.id) onlineUsers.delete(username);
    });
  });
});

app.get('/health', (req, res) => res.json({
  status: 'OK',
  timestamp: new Date(),
  service: 'CloudChat API'
}));

server.listen(PORT, () =>
  console.log('🚀 Server running on port', PORT));