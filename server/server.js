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

```
const history = await Message.find({ room })
  .sort('-timestamp').limit(50);
socket.emit('message_history', history.reverse());

const newHistory = await NewMessage.find({ room })
  .sort({ createdAt: -1 }).limit(50).lean();
socket.emit('messageHistory', newHistory.reverse());
```

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
