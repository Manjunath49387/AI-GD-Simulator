require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Initialize DB (runs schema creation)
const db = require('./db');

// Routes
const authRoutes = require('./routes/auth');
const sessionsRoutes = require('./routes/sessions');
const aiRoutes = require('./routes/ai');
const performanceRoutes = require('./routes/performance');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── API ROUTES ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/performance', performanceRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'GD Simulator API'
  });
});

// ─── HUMAN MODE - SOCKET.IO ROOMS ────────────────────────────────────────────
// rooms: { roomId: { topic, hostUserId, hostSocketId, hostSessionId, participants, messages, timerDuration, timerRemaining, status } }
const rooms = {};

// Helper to end a room and emit individual session mappings
function _endRoom(cleanRoomId, message) {
  const room = rooms[cleanRoomId];
  if (!room) return;
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
  room.status = 'ended';

  // Ensure all room messages are saved to all registered participant sessions
  if (room.messages && room.messages.length > 0 && room.participants) {
    for (const msg of room.messages) {
      for (const p of room.participants) {
        if (p.sessionId) {
          const isSender = (p.socketId === msg.socketId || (p.name && p.name.trim().toLowerCase() === msg.userName.trim().toLowerCase()));
          const spkType = isSender ? 'user' : 'system';
          try {
            // Check if already inserted to prevent duplicates
            const count = db.prepare(
              'SELECT COUNT(*) as cnt FROM gd_transcripts WHERE session_id = ? AND speaker = ? AND message = ?'
            ).get(p.sessionId, msg.userName, msg.message);
            if (!count || count.cnt === 0) {
              db.prepare(`
                INSERT INTO gd_transcripts (session_id, speaker, speaker_type, message, word_count)
                VALUES (?, ?, ?, ?, ?)
              `).run(p.sessionId, msg.userName, spkType, msg.message, msg.wordCount || 1);
            }
          } catch (e) {
            console.warn(`[Sync] Transcript sync warn for session ${p.sessionId}:`, e.message);
          }
        }
      }
    }
  }

  // Build a map of userId -> sessionId and socketId -> sessionId
  const sessionMap = {};
  (room.participants || []).forEach(p => {
    if (p.userId && p.sessionId) sessionMap[p.userId] = p.sessionId;
    if (p.socketId && p.sessionId) sessionMap[p.socketId] = p.sessionId;
  });

  io.to(cleanRoomId).emit('room:ended', {
    message: message || 'Discussion ended.',
    sessionMap,
    participants: room.participants
  });
  console.log(`🏁 Room ${cleanRoomId} ended. Individual sessions mapped:`, sessionMap);
}

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Create a new human GD room (as Host)
  socket.on('room:create', ({ roomId, topic, userName, userId, sessionId }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (!cleanRoomId) return;

    if (!rooms[cleanRoomId]) {
      rooms[cleanRoomId] = {
        topic: topic || 'The Role of Artificial Intelligence in Modern Education',
        hostUserId: userId || null,
        hostSocketId: socket.id,
        hostSessionId: sessionId || null,
        participants: [],
        messages: [],
        timerDuration: 10 * 60, // 10 minutes default
        timerRemaining: 10 * 60,
        timerInterval: null,
        status: 'waiting' // 'waiting' | 'active' | 'ended'
      };
    } else {
      if (topic) rooms[cleanRoomId].topic = topic;
      if (userId && !rooms[cleanRoomId].hostUserId) rooms[cleanRoomId].hostUserId = userId;
      if (sessionId && !rooms[cleanRoomId].hostSessionId) rooms[cleanRoomId].hostSessionId = sessionId;
      if (!rooms[cleanRoomId].messages) rooms[cleanRoomId].messages = [];
    }

    const participant = {
      socketId: socket.id,
      userId: userId || null,
      name: userName || 'Host',
      sessionId: sessionId || null,
      isMuted: false,
      isConnected: true,
      isHost: true
    };

    const existingIndex = rooms[cleanRoomId].participants.findIndex(
      p => (userId && p.userId === userId) || p.socketId === socket.id
    );
    if (existingIndex >= 0) {
      rooms[cleanRoomId].participants[existingIndex] = { ...rooms[cleanRoomId].participants[existingIndex], ...participant };
    } else {
      rooms[cleanRoomId].participants.push(participant);
    }
    socket.join(cleanRoomId);

    socket.emit('room:joined', {
      roomId: cleanRoomId,
      topic: rooms[cleanRoomId].topic,
      isHost: true,
      status: rooms[cleanRoomId].status,
      participants: rooms[cleanRoomId].participants
    });

    socket.to(cleanRoomId).emit('room:participant_joined', {
      participant,
      participants: rooms[cleanRoomId].participants
    });

    console.log(`🏠 Room created/hosted: ${cleanRoomId} by ${userName} (Total ${rooms[cleanRoomId].participants.length} in waiting hall)`);
  });

  // Join an existing room (as participant)
  socket.on('room:join', ({ roomId, userName, userId, sessionId }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (!cleanRoomId) {
      socket.emit('room:error', { message: 'Invalid Room ID provided.' });
      return;
    }

    // Auto-create room if not yet created so users can join with any shared code seamlessly
    if (!rooms[cleanRoomId]) {
      rooms[cleanRoomId] = {
        topic: 'General Group Discussion',
        hostUserId: userId || null,
        hostSocketId: socket.id,
        hostSessionId: sessionId || null,
        participants: [],
        messages: [],
        timerDuration: 10 * 60,
        timerRemaining: 10 * 60,
        timerInterval: null,
        status: 'waiting'
      };
      console.log(`🏠 Room auto-initialized on join: ${cleanRoomId}`);
    } else {
      if (!rooms[cleanRoomId].messages) rooms[cleanRoomId].messages = [];
    }

    if (rooms[cleanRoomId].status === 'ended') {
      socket.emit('room:error', { message: 'This discussion has already ended.' });
      return;
    }

    const isHost = rooms[cleanRoomId].hostUserId ? (rooms[cleanRoomId].hostUserId === userId) : (rooms[cleanRoomId].participants.length === 0);
    if (isHost && !rooms[cleanRoomId].hostUserId) {
      rooms[cleanRoomId].hostUserId = userId;
      rooms[cleanRoomId].hostSocketId = socket.id;
    }
    if (isHost && sessionId && !rooms[cleanRoomId].hostSessionId) {
      rooms[cleanRoomId].hostSessionId = sessionId;
    }

    const participant = {
      socketId: socket.id,
      userId: userId || null,
      name: userName || 'Participant',
      sessionId: sessionId || null,
      isMuted: false,
      isConnected: true,
      isHost
    };

    const existingIndex = rooms[cleanRoomId].participants.findIndex(
      p => (userId && p.userId === userId) || p.socketId === socket.id
    );
    if (existingIndex >= 0) {
      rooms[cleanRoomId].participants[existingIndex] = { ...rooms[cleanRoomId].participants[existingIndex], ...participant };
    } else {
      rooms[cleanRoomId].participants.push(participant);
    }
    socket.join(cleanRoomId);

    // Notify the joiner with room status & remaining timer if active
    socket.emit('room:joined', {
      roomId: cleanRoomId,
      topic: rooms[cleanRoomId].topic,
      isHost,
      status: rooms[cleanRoomId].status,
      timerRemaining: rooms[cleanRoomId].timerRemaining,
      participants: rooms[cleanRoomId].participants
    });

    // Notify others in room
    socket.to(cleanRoomId).emit('room:participant_joined', {
      participant,
      participants: rooms[cleanRoomId].participants
    });

    console.log(`👤 ${userName} (${isHost ? 'Host' : 'Member'}) joined room: ${cleanRoomId} (Total: ${rooms[cleanRoomId].participants.length}, status=${rooms[cleanRoomId].status})`);
  });

  // Client registers or updates their own database sessionId in this room
  socket.on('room:register_session', ({ roomId, userId, sessionId }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (!rooms[cleanRoomId]) return;
    const participant = rooms[cleanRoomId].participants.find(p => (userId && p.userId === userId) || p.socketId === socket.id);
    if (participant) {
      participant.sessionId = sessionId;
      if (participant.isHost) {
        rooms[cleanRoomId].hostSessionId = sessionId;
      }

      // Backfill any prior messages in this room to this participant's database session
      if (rooms[cleanRoomId].messages && rooms[cleanRoomId].messages.length > 0) {
        for (const msg of rooms[cleanRoomId].messages) {
          const isSender = (participant.socketId === msg.socketId || (participant.name && participant.name.trim().toLowerCase() === msg.userName.trim().toLowerCase()));
          const spkType = isSender ? 'user' : 'system';
          try {
            const count = db.prepare(
              'SELECT COUNT(*) as cnt FROM gd_transcripts WHERE session_id = ? AND speaker = ? AND message = ?'
            ).get(sessionId, msg.userName, msg.message);
            if (!count || count.cnt === 0) {
              db.prepare(`
                INSERT INTO gd_transcripts (session_id, speaker, speaker_type, message, word_count)
                VALUES (?, ?, ?, ?, ?)
              `).run(sessionId, msg.userName, spkType, msg.message, msg.wordCount || 1);
            }
          } catch (e) {
            console.warn(`[Sync] Backfill warning for session ${sessionId}:`, e.message);
          }
        }
      }

      io.to(cleanRoomId).emit('room:participants_update', rooms[cleanRoomId].participants);
      console.log(`📝 Registered session ${sessionId} for user ${participant.name} in room ${cleanRoomId}`);
    }
  });

  // Send a chat message & record across all connected participant sessions
  socket.on('room:message', ({ roomId, userName, message, timestamp }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (!cleanRoomId || !message) return;
    const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
    const msgData = {
      userName,
      message,
      wordCount,
      socketId: socket.id,
      timestamp: timestamp || new Date().toISOString()
    };

    if (rooms[cleanRoomId]) {
      if (!rooms[cleanRoomId].messages) rooms[cleanRoomId].messages = [];
      rooms[cleanRoomId].messages.push(msgData);

      // Save message to every participant's individual session in this room
      for (const p of rooms[cleanRoomId].participants) {
        if (p.sessionId) {
          const isSender = (p.socketId === socket.id || (p.name && p.name.trim().toLowerCase() === userName.trim().toLowerCase()));
          const spkType = isSender ? 'user' : 'system';
          try {
            db.prepare(`
              INSERT INTO gd_transcripts (session_id, speaker, speaker_type, message, word_count)
              VALUES (?, ?, ?, ?, ?)
            `).run(p.sessionId, userName, spkType, message, wordCount);
          } catch (e) {
            console.warn(`[Message] DB save error for session ${p.sessionId}:`, e.message);
          }
        }
      }
    }

    io.to(cleanRoomId).emit('room:message', {
      userName: msgData.userName,
      message: msgData.message,
      timestamp: msgData.timestamp
    });
  });

  // Mute/unmute toggle
  socket.on('room:toggle_mute', ({ roomId, isMuted }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (rooms[cleanRoomId]) {
      const participant = rooms[cleanRoomId].participants.find(p => p.socketId === socket.id);
      if (participant) {
        participant.isMuted = isMuted;
        io.to(cleanRoomId).emit('room:participants_update', rooms[cleanRoomId].participants);
      }
    }
  });

  // Host starts the discussion (from waiting hall)
  socket.on('room:start', ({ roomId, duration }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (!rooms[cleanRoomId]) return;

    rooms[cleanRoomId].status = 'active';
    rooms[cleanRoomId].timerDuration = duration || 10 * 60;
    rooms[cleanRoomId].timerRemaining = rooms[cleanRoomId].timerDuration;

    io.to(cleanRoomId).emit('room:started', {
      topic: rooms[cleanRoomId].topic,
      participants: rooms[cleanRoomId].participants
    });
    console.log(`▶️ Room ${cleanRoomId} discussion started by host!`);

    // Start countdown timer
    if (rooms[cleanRoomId].timerInterval) clearInterval(rooms[cleanRoomId].timerInterval);
    rooms[cleanRoomId].timerInterval = setInterval(() => {
      if (!rooms[cleanRoomId]) return;
      rooms[cleanRoomId].timerRemaining--;
      io.to(cleanRoomId).emit('room:timer', { remaining: rooms[cleanRoomId].timerRemaining });

      if (rooms[cleanRoomId].timerRemaining <= 0) {
        _endRoom(cleanRoomId, 'Discussion time is up!');
      }
    }, 1000);
  });

  // End discussion manually (e.g. host clicks End Discussion)
  socket.on('room:end', ({ roomId }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    _endRoom(cleanRoomId, 'Discussion ended by host.');
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);

    // Remove from any room
    for (const rId in rooms) {
      if (!rooms[rId] || !rooms[rId].participants) continue;
      const idx = rooms[rId].participants.findIndex(p => p.socketId === socket.id);
      if (idx !== -1) {
        const leavingParticipant = rooms[rId].participants[idx];
        const name = leavingParticipant.name;
        rooms[rId].participants.splice(idx, 1);

        socket.to(rId).emit('room:participant_left', {
          name,
          participants: rooms[rId].participants
        });

        // Clean up empty rooms
        if (rooms[rId].participants.length === 0) {
          if (rooms[rId].timerInterval) clearInterval(rooms[rId].timerInterval);
          delete rooms[rId];
          console.log(`🗑️  Room ${rId} cleaned up (empty)`);
        }
        break;
      }
    }
  });
});

// ─── CATCH-ALL: Serve frontend for SPA-style routing ─────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ─── START SERVER (Only when run directly, not in Vercel Serverless) ─────────
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log('');
    console.log('🚀 ========================================');
    console.log(`🎯  GD Simulator Server Running!`);
    console.log(`🌐  http://localhost:${PORT}`);
    console.log(`📊  API: http://localhost:${PORT}/api/health`);
    console.log('🚀 ========================================');
    console.log('');
  });
}

app.app = app;
app.server = server;
app.io = io;

module.exports = app;
