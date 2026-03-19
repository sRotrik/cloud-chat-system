const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const PrivateMessage = require('../models/PrivateMessage');
const Conversation = require('../models/Conversation');

const getSharedKey = (user1, user2) => {
  const sorted = [user1, user2].sort().join(':');
  return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 32);
};

const getRoomId = (user1, user2) => {
  return [user1, user2].sort().join('_');
};

// Get all conversations for a user
router.get('/conversations/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const conversations = await Conversation.find({
      participants: username
    }).sort('-lastMessageTime');

    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get private message history
router.get('/history/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const roomId = getRoomId(user1, user2);
    const key = getSharedKey(user1, user2);

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

    res.json(decrypted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search users by username
router.get('/search/:query', async (req, res) => {
  try {
    const User = require('../models/User');
    const users = await User.find({
      username: { $regex: req.params.query, $options: 'i' }
    }).select('username lastSeen').limit(20);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET online users list
router.get('/users', async (req, res) => {
  try {
    const User = require('../models/User');
    const users = await User.find({}).select('username lastSeen').limit(50);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, getSharedKey, getRoomId };