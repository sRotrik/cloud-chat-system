const Message = require('./models/Message');

async function pub(io, room, event, payload) {
  io.to(room).emit(event, payload);
}

function registerHandlers(socket, io) {

  // ── Send message (text / reply / voice) ──
  socket.on('sendMessage', async ({ room, username, text, replyTo, type, voiceUrl, voiceDuration, waveform, expiresIn }) => {
    try {
      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

      const msg = await Message.create({
        room, username, text,
        type:          type || 'text',
        voiceUrl:      voiceUrl || null,
        voiceDuration: voiceDuration || 0,
        waveform:      waveform || [],
        replyTo:       replyTo || null,
        status:        'sent',
        expiresAt
      });

      const payload = {
        _id: msg._id,
        room, username, text,
        type:          msg.type,
        voiceUrl:      msg.voiceUrl,
        voiceDuration: msg.voiceDuration,
        waveform:      msg.waveform,
        replyTo:       msg.replyTo,
        reactions:     {},
        readBy:        [],
        status:        'sent',
        createdAt:     msg.createdAt
      };

      await pub(io, room, 'newMessage', payload);

      // Mark as delivered to current room members
      const roomSockets  = await io.in(room).fetchSockets();
      const deliveredTo  = roomSockets
        .map(s => s.data?.username)
        .filter(Boolean)
        .filter(u => u !== username);

      if (deliveredTo.length > 0) {
        await Message.findByIdAndUpdate(msg._id, {
          $addToSet: { deliveredTo: { $each: deliveredTo } },
          status: 'delivered'
        });
        await pub(io, room, 'messageDelivered', { messageId: msg._id, deliveredTo });
      }

    } catch (err) {
      socket.emit('error', { message: 'Failed to send message' });
      console.error('[sendMessage]', err);
    }
  });

  // ── React to message ──
  socket.on('reactToMessage', async ({ messageId, emoji, username, room }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return socket.emit('error', { message: 'Message not found' });

      let reaction = msg.reactions.get(emoji) || { emoji, users: [], count: 0 };
      const alreadyReacted = reaction.users.includes(username);

      if (alreadyReacted) {
        reaction.users = reaction.users.filter(u => u !== username);
        reaction.count = reaction.users.length;
      } else {
        reaction.users.push(username);
        reaction.count = reaction.users.length;
      }

      if (reaction.count === 0) {
        msg.reactions.delete(emoji);
      } else {
        msg.reactions.set(emoji, reaction);
      }

      msg.markModified('reactions');
      await msg.save();

      const reactionsObj = {};
      msg.reactions.forEach((val, key) => { reactionsObj[key] = val; });

      await pub(io, room, 'reactionUpdated', { messageId, reactions: reactionsObj });

    } catch (err) {
      socket.emit('error', { message: 'Failed to update reaction' });
      console.error('[reactToMessage]', err);
    }
  });

  // ── Mark messages as read ──
  socket.on('markAsRead', async ({ messageIds, username, room }) => {
    try {
      if (!messageIds?.length) return;

      await Message.updateMany(
        { _id: { $in: messageIds }, 'readBy.username': { $ne: username } },
        {
          $push: { readBy: { username, readAt: new Date() } },
          $set:  { status: 'read' }
        }
      );

      await pub(io, room, 'messagesRead', {
        messageIds,
        readBy: username,
        readAt: new Date()
      });

    } catch (err) {
      console.error('[markAsRead]', err);
    }
  });

  // ── Delete message ──
  socket.on('deleteMessage', async ({ messageId, room, username, forEveryone }) => {
    try {
      if (!forEveryone) return; // Handled locally on client
      
      const msg = await Message.findById(messageId);
      if (!msg) return socket.emit('error', { message: 'Message not found' });
      
      // Allow only the sender to delete for everyone
      if (msg.username !== username) {
        return socket.emit('error', { message: 'Not authorized to delete' });
      }

      await Message.findByIdAndDelete(messageId);
      await pub(io, room, 'messageDeleted', { messageId, forEveryone: true });

    } catch (err) {
      socket.emit('error', { message: 'Failed to delete message' });
      console.error('[deleteMessage]', err);
    }
  });

  // ── Search messages ──
  socket.on('searchMessages', async ({ room, query }) => {
    try {
      if (!query || query.trim().length < 2) {
        return socket.emit('searchResults', { query, results: [] });
      }

      const results = await Message.find(
        { room, $text: { $search: query } },
        { score: { $meta: 'textScore' } }
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(30)
        .lean();

      const escaped    = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex      = new RegExp(`(${escaped})`, 'gi');
      const highlighted = results.map(m => ({
        ...m,
        highlight: m.text.replace(regex, '**$1**')
      }));

      socket.emit('searchResults', { query, results: highlighted });

    } catch (err) {
      socket.emit('searchResults', { query, results: [] });
      console.error('[searchMessages]', err);
    }
  });

  // ── Typing indicators ──
  socket.on('typing',     ({ room, username }) => socket.to(room).emit('userTyping',     { username }));
  socket.on('stopTyping', ({ room, username }) => socket.to(room).emit('userStopTyping', { username }));

  // ── Join room ──
  socket.on('joinRoom', async ({ room, username }) => {
    socket.join(room);
    socket.data = { username, room };

    const messages = await Message.find({ room })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    socket.emit('messageHistory', messages.reverse());
    socket.to(room).emit('userJoined', { username, room });
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const { username, room } = socket.data || {};
    if (username && room) {
      io.to(room).emit('userLeft', { username });
    }
  });
}

module.exports = { registerHandlers };