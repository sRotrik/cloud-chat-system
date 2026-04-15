const mongoose = require('mongoose');

const PrivateMessageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  encryptedMessage: { type: String, default: '' },   // optional — empty for voice msgs
  roomId: { type: String, required: true },
  type: { type: String, default: 'text' },           // 'text' | 'voice'
  voiceUrl: { type: String },
  voiceDuration: { type: Number, default: 0 },
  waveform: { type: [Number], default: [] },
  fileUrl: { type: String },
  mimetype: { type: String },
  originalName: { type: String },
  timestamp: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

PrivateMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PrivateMessage', PrivateMessageSchema);