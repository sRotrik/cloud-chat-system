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

const MONGO = process.env.MONGO_URI;
const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL;

const app = express();
app.use(cors());
app.use(express.json());

/* ✅ FIX 1: ROOT ROUTE */
app.get('/', (req, res) => {
res.send('🚀 Cloud Chat Server is running');
});

/* EXISTING ROUTES */
const authRoutes = require('./routes/auth');
const { router: privateRoutes, getSharedKey, getRoomId } = require('./routes/private');
const mediaRoutes = require('./routes/media');

app.use('/auth', authRoutes);
app.use('/private', privateRoutes);
app.use('/media', mediaRoutes);
app.use('/api/voice', voiceRoute);

const server = http.createServer(app);
const io = new Server(server, {
cors: { origin: '*', methods: ['GET', 'POST'] }
});

/* ✅ FIX 2: SAFE REDIS (NO CRASH IF MISSING) */
if (REDIS_URL) {
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
} else {
console.log('⚠️ REDIS_URL not set, running without Redis');
}

mongoose.connect(MONGO)
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.log('❌ MongoDB Error:', err.message));

/* YOUR EXISTING CODE BELOW (UNCHANGED) */
const ChatMessageSchema = new mongoose.Schema({
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
ChatMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Message = mongoose.model('ChatMessage', ChatMessageSchema);

const NewMessage = require('./models/Message');
const PrivateMessage = require('./models/PrivateMessage');
const Conversation = require('./models/Conversation');

const onlineUsers = new Map();

io.on('connection', (socket) => {
console.log('✅ User connected:', socket.id);

registerHandlers(socket, io);

socket.on('register_user', (username) => {
onlineUsers.set(username, socket.id);
socket.data = { ...socket.data, username };
io.emit('online_users_list', Array.from(onlineUsers.keys()));
socket.emit('online_users_list', Array.from(onlineUsers.keys()));
});

socket.on('join_room', async (room) => {
socket.join(room);
socket.data = { ...socket.data, room };
const history = await Message.find({ room })
  .sort('-timestamp').limit(50);
socket.emit('message_history', history.reverse());

const newHistory = await NewMessage.find({ room })
  .sort({ createdAt: -1 }).limit(50).lean();
socket.emit('messageHistory', newHistory.reverse());

});

socket.on('send_message', async (data) => {
const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
const msg = new Message({ ...data, expiresAt });
await msg.save();
io.to(data.room).emit('receive_message', {
...data,
timestamp: msg.timestamp,
expiresAt: msg.expiresAt,
});
});

socket.on('join_private', async ({ from, to }) => {
  const roomId = getRoomId(from, to);
  socket.join(roomId);
  
  const key = getSharedKey(from, to);
  const messages = await PrivateMessage.find({ roomId }).sort('-timestamp').limit(50);
  
  const decrypted = messages.map(msg => {
    try {
      if (!msg.encryptedMessage) return { from: msg.from, to: msg.to, message: '', fileUrl: msg.fileUrl, mimetype: msg.mimetype, originalName: msg.originalName, timestamp: msg.timestamp, expiresAt: msg.expiresAt };
      const [ivHex, encrypted] = msg.encryptedMessage.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
      let text = decipher.update(encrypted, 'hex', 'utf8');
      text += decipher.final('utf8');
      return { from: msg.from, to: msg.to, message: text, timestamp: msg.timestamp, expiresAt: msg.expiresAt, fileUrl: msg.fileUrl, mimetype: msg.mimetype, originalName: msg.originalName };
    } catch {
      return { from: msg.from, to: msg.to, message: '[Encrypted]', timestamp: msg.timestamp };
    }
  }).reverse();

  socket.emit('private_history', decrypted);
});

socket.on('send_private', async (data) => {
  const { from, to, message, fileUrl, fileId, mimetype, originalName } = data;
  const roomId = getRoomId(from, to);
  const key = getSharedKey(from, to);
  
  let encryptedMessage = '';
  if (message) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    encryptedMessage = `${iv.toString('hex')}:${encrypted}`;
  }
  
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const msg = new PrivateMessage({
    roomId, from, to, encryptedMessage,
    fileUrl, fileId, mimetype, originalName,
    expiresAt
  });
  await msg.save();
  
  await Conversation.findOneAndUpdate(
    { participants: [from, to].sort() },
    { 
      $set: {
        lastMessage: 'Encrypted message', 
        lastMessageTime: new Date(), 
        lastMessageFrom: from
      },
      $inc: { [`unreadCount.${to}`]: 1 }
    },
    { upsert: true, new: true }
  );

  const payload = {
    from, to, message, 
    fileUrl, fileId, mimetype, originalName,
    timestamp: msg.timestamp, expiresAt
  };

  io.to(roomId).emit('receive_private', payload);
  
  const recipientSocketId = onlineUsers.get(to);
  if (recipientSocketId) {
    io.to(recipientSocketId).emit('private_notification', { from });
  }
});

socket.on('mark_read', async ({ from, to }) => {
  await Conversation.findOneAndUpdate(
    { participants: [from, to].sort() },
    { $set: { [`unreadCount.${from}`]: 0 } }
  );
  if (onlineUsers.has(from)) {
    io.to(onlineUsers.get(from)).emit('refresh_conversations');
  }
});

socket.on('private_typing', ({ from, to }) => {
  const roomId = getRoomId(from, to);
  socket.to(roomId).emit('private_user_typing', from);
});

socket.on('disconnect', () => {
onlineUsers.forEach((id, uname) => {
if (id === socket.id) onlineUsers.delete(uname);
});
io.emit('online_users_list', Array.from(onlineUsers.keys()));
});
});

/* EXISTING HEALTH ROUTE */
app.get('/health', (req, res) => res.json({
status: 'OK', timestamp: new Date(), service: 'CloudChat API'
}));

server.listen(PORT, () => console.log('🚀 Server running on port', PORT));
