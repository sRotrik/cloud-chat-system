const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  participants: [String],
  lastMessage: { type: String, default: '' },
  lastMessageFrom: { type: String, default: '' },
  lastMessageTime: { type: Date, default: Date.now },
  unreadCount: { type: Map, of: Number, default: {} },
});

module.exports = mongoose.model('Conversation', ConversationSchema);