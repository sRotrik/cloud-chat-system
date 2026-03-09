const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const cors = require('cors');
const path = require('path');

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

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Redis Pub/Sub setup
const pubClient = createClient({ url: REDIS_URL });
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

const MessageSchema = new mongoose.Schema({
  room: String,
  username: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

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

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

app.get('/health', (req, res) => res.json({
  status: 'OK',
  timestamp: new Date(),
  service: 'CloudChat API'
}));

server.listen(PORT, () =>
  console.log('🚀 Server running on port', PORT));