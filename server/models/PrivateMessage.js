const mongoose = require('mongoose');

const PrivateMessageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  encryptedMessage: { type: String, required: true },
  roomId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

PrivateMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PrivateMessage', PrivateMessageSchema);