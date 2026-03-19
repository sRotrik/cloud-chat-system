const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const PrivateMessage = require('../models/PrivateMessage');

// Generate a shared encryption key for two users
const getSharedKey = (user1, user2) => {
  const sorted = [user1, user2].sort().join(':');
  return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 32);
};

// Get room ID for two users
const getRoomId = (user1, user2) => {
  return [user1, user2].sort().join('_');
};

// Encrypt message
const encryptMessage = (message, key) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
  let encrypted = cipher.update(message, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

// Decrypt message
const decryptMessage = (encryptedData, key) => {
  try {
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return '[Encrypted Message]';
  }
};

// GET private message history
router.get('/history/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const roomId = getRoomId(user1, user2);
    const key = getSharedKey(user1, user2);

    const messages = await PrivateMessage.find({ roomId })
      .sort('timestamp')
      .limit(50);

    const decrypted = messages.map(msg => ({
      from: msg.from,
      to: msg.to,
      message: decryptMessage(msg.encryptedMessage, key),
      timestamp: msg.timestamp,
      expiresAt: msg.expiresAt,
    }));

    res.json(decrypted);
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

module.exports = { router, encryptMessage, decryptMessage, getSharedKey, getRoomId };