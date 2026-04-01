const mongoose = require('mongoose');

const ReactionSchema = new mongoose.Schema({
  emoji:  { type: String, required: true },
  users:  [{ type: String }],
  count:  { type: Number, default: 0 }
}, { _id: false });

const ReadReceiptSchema = new mongoose.Schema({
  username: { type: String, required: true },
  readAt:   { type: Date, default: Date.now }
}, { _id: false });

const ReplyRefSchema = new mongoose.Schema({
  messageId: { type: mongoose.Schema.Types.ObjectId },
  username:  { type: String },
  text:      { type: String },
  type:      { type: String, default: 'text' }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  room:     { type: String, required: true, index: true },
  username: { type: String, required: true },
  text:     { type: String, default: '' },

  type: {
    type: String,
    enum: ['text', 'voice', 'system'],
    default: 'text'
  },

  voiceUrl:      { type: String, default: null },
  voiceDuration: { type: Number, default: 0 },
  waveform:      [{ type: Number }],

  replyTo:     { type: ReplyRefSchema, default: null },
  reactions:   { type: Map, of: ReactionSchema, default: {} },
  deliveredTo: [{ type: String }],
  readBy:      [ReadReceiptSchema],

  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },

  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true }
});

MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });
MessageSchema.index({ room: 1, text: 'text' });

MessageSchema.virtual('reactionsArray').get(function () {
  return Array.from(this.reactions.entries()).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    users: data.users
  }));
});

MessageSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Message', MessageSchema);