const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { registerHandlers } = require('./socketHandlers');
const voiceRoute = require('./routes/voice');

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

const authRoutes = require('./routes/auth');
const { router: privateRoutes, getSharedKey, getRoomId } = require('./routes/private');
const mediaRoutes = require('./routes/media');
app.use('/auth', authRoutes);
app.use('/private', privateRoutes);
app.use('/media', mediaRoutes);
app.use('/api/voice', voiceRoute);  // ← voice upload route (already added)

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

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

// ── OLD inline message schema (kept for backward compatibility) ──
const MessageSchema = new mongoose.Schema({
  room: String,
  username: String,
  message: String,
  fileUrl: String,
  fileId: String,
  mimetype: String,
  originalName: String,
  timestamp: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 5 * 60 * 1000) }
});
MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Message = mongoose.model('Message', MessageSchema);

// ── NEW Message model (reactions, read receipts, reply, voice, search) ──
const NewMessage = require('./models/Message');

const PrivateMessage = require('./models/PrivateMessage');
const Conversation = require('./models/Conversation');

const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // ── NEW: Register all new feature handlers (reactions, read receipts, etc.) ──
  registerHandlers(socket, io);

  socket.on('register_user', (username) => {
    onlineUsers.set(username, socket.id);
    socket.data = { ...socket.data, username };  // ← store username for socketHandlers
    console.log(`👤 ${username} registered with socket ${socket.id}`);
    io.emit('online_users_list', Array.from(onlineUsers.keys()));
    socket.emit('online_users_list', Array.from(onlineUsers.keys()));
  });

  socket.on('join_room', async (room) => {
    socket.join(room);
    socket.data = { ...socket.data, room };  // ← store room for socketHandlers

    // Old message history (existing chat)
    const history = await Message.find({ room })
      .sort('-timestamp').limit(50);
    socket.emit('message_history', history.reverse());

    // NEW: Also send new-format message history
    const newHistory = await NewMessage.find({ room })
      .sort({ createdAt: -1 }).limit(50).lean();
    socket.emit('messageHistory', newHistory.reverse());

    io.to(room).emit('online_count',
      io.sockets.adapter.rooms.get(room)?.size || 0);
  });

  socket.on('send_message', async (data) => {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const msg = new Message({ ...data, expiresAt });
    await msg.save();
    io.to(data.room).emit('receive_message', {
      username:     data.username,
      message:      data.message,
      fileUrl:      data.fileUrl,
      fileId:       data.fileId,
      mimetype:     data.mimetype,
      originalName: data.originalName,
      timestamp:    msg.timestamp,
      expiresAt:    msg.expiresAt,
    });
  });

  socket.on('typing', (data) => {
    socket.to(data.room).emit('user_typing', data.username);
  });

  socket.on('join_private', async ({ from, to }) => {
    const roomId = getRoomId(from, to);
    socket.join(`private_${roomId}`);
    onlineUsers.set(from, socket.id);

    await Conversation.findOneAndUpdate(
      { participants: { $all: [from, to] } },
      { $set: { [`unreadCount.${from}`]: 0 } }
    );

    const key = getSharedKey(from, to);
    const messages = await PrivateMessage.find({ roomId })
      .sort('timestamp').limit(50);

    const decrypted = messages.map(msg => {
      try {
        const [ivHex, encrypted] = msg.encryptedMessage.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
        let text = decipher.update(encrypted, 'hex', 'utf8');
        text += decipher.final('utf8');
        return { from: msg.from, to: msg.to, message: text, timestamp: msg.timestamp, expiresAt: msg.expiresAt, fileUrl: msg.fileUrl, mimetype: msg.mimetype, originalName: msg.originalName };
      } catch {
        return { from: msg.from, to: msg.to, message: '[Encrypted]', timestamp: msg.timestamp };
      }
    });

    socket.emit('private_history', decrypted);
  });

  socket.on('send_private', async ({ from, to, message, fileUrl, mimetype, originalName }) => {
    const roomId = getRoomId(from, to);
    const key = getSharedKey(from, to);
    const timestamp = new Date();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    socket.join(`private_${roomId}`);

    io.to(`private_${roomId}`).emit('receive_private', {
      from, to, message, timestamp, expiresAt,
      fileUrl, mimetype, originalName,
    });

    const receiverSocketId = onlineUsers.get(to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('private_notification', { from, message });
    }

    setImmediate(async () => {
      try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
        let encrypted = cipher.update(message, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const encryptedMessage = iv.toString('hex') + ':' + encrypted;

        const msg = new PrivateMessage({ from, to, encryptedMessage, roomId, expiresAt, fileUrl, mimetype, originalName });
        await msg.save();

        let conv = await Conversation.findOne({ participants: { $all: [from, to] } });
        if (!conv) {
          conv = new Conversation({
            participants: [from, to],
            lastMessage: message,
            lastMessageFrom: from,
            lastMessageTime: timestamp,
            unreadCount: { [to]: 1, [from]: 0 },
          });
          await conv.save();
        } else {
          conv.lastMessage = message;
          conv.lastMessageFrom = from;
          conv.lastMessageTime = timestamp;
          conv.unreadCount = conv.unreadCount || {};
          conv.unreadCount[to] = (conv.unreadCount[to] || 0) + 1;
          conv.markModified('unreadCount');
          await conv.save();
        }

        const receiverSockId = onlineUsers.get(to);
        if (receiverSockId) {
          io.to(receiverSockId).emit('refresh_conversations');
        }
      } catch (err) {
        console.log('Background save error:', err.message);
      }
    });
  });

  socket.on('mark_read', async ({ from, to }) => {
    const roomId = getRoomId(from, to);
    const readTime = new Date();
    const newExpiry = new Date(readTime.getTime() + 5 * 60 * 1000);

    await Conversation.findOneAndUpdate(
      { participants: { $all: [from, to] } },
      { $set: { [`unreadCount.${from}`]: 0 } }
    );

    await PrivateMessage.updateMany(
      { roomId, to: from },
      { $set: { expiresAt: newExpiry } }
    );

    io.to(`private_${roomId}`).emit('messages_expiry_updated', {
      roomId, newExpiry
    });
  });

  socket.on('private_typing', ({ from, to }) => {
    const roomId = getRoomId(from, to);
    socket.to(`private_${roomId}`).emit('private_user_typing', from);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    onlineUsers.forEach((id, uname) => {
      if (id === socket.id) onlineUsers.delete(uname);
    });
    io.emit('online_users_list', Array.from(onlineUsers.keys()));
  });
});

app.get('/health', (req, res) => res.json({
  status: 'OK', timestamp: new Date(), service: 'CloudChat API'
}));

server.listen(PORT, () => console.log('🚀 Server running on port', PORT));