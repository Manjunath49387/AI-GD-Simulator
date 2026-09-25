require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Initialize DB (runs schema creation)
require('./db');

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
const rooms = {}; // { roomId: { topic, participants: [], timer } }

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Create a new human GD room
  socket.on('room:create', ({ roomId, topic, userName, userId }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (!cleanRoomId) return;

    rooms[cleanRoomId] = {
      topic: topic || 'The Role of Artificial Intelligence in Modern Education',
      participants: [],
      timerDuration: 10 * 60, // 10 minutes
      timerRemaining: 10 * 60,
      timerInterval: null,
      status: 'waiting'
    };

    const participant = { socketId: socket.id, userId, name: userName, isMuted: false, isConnected: true };
    rooms[cleanRoomId].participants.push(participant);
    socket.join(cleanRoomId);

    socket.emit('room:joined', {
      roomId: cleanRoomId,
      topic: rooms[cleanRoomId].topic,
      participants: rooms[cleanRoomId].participants
    });

    console.log(`🏠 Room created: ${cleanRoomId} by ${userName}`);
  });

  // Join an existing room
  socket.on('room:join', ({ roomId, userName, userId }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (!rooms[cleanRoomId]) {
      socket.emit('room:error', { message: `Room "${cleanRoomId || roomId}" does not exist. Please check the Room ID.` });
      return;
    }

    if (rooms[cleanRoomId].status === 'ended') {
      socket.emit('room:error', { message: 'This discussion has already ended.' });
      return;
    }

    const participant = { socketId: socket.id, userId, name: userName, isMuted: false, isConnected: true };
    rooms[cleanRoomId].participants.push(participant);
    socket.join(cleanRoomId);

    // Notify the joiner
    socket.emit('room:joined', {
      roomId: cleanRoomId,
      topic: rooms[cleanRoomId].topic,
      participants: rooms[cleanRoomId].participants
    });

    // Notify others in room
    socket.to(cleanRoomId).emit('room:participant_joined', {
      participant,
      participants: rooms[cleanRoomId].participants
    });

    console.log(`👤 ${userName} joined room: ${cleanRoomId}`);
  });

  // Send a chat message
  socket.on('room:message', ({ roomId, userName, message, timestamp }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (!cleanRoomId) return;
    const msgData = { userName, message, timestamp: timestamp || new Date().toISOString() };
    io.to(cleanRoomId).emit('room:message', msgData);
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

  // Start the discussion timer
  socket.on('room:start', ({ roomId, duration }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (!rooms[cleanRoomId]) return;

    rooms[cleanRoomId].status = 'active';
    rooms[cleanRoomId].timerDuration = duration || 10 * 60;
    rooms[cleanRoomId].timerRemaining = rooms[cleanRoomId].timerDuration;

    io.to(cleanRoomId).emit('room:started', { topic: rooms[cleanRoomId].topic });

    // Start timer
    if (rooms[cleanRoomId].timerInterval) clearInterval(rooms[cleanRoomId].timerInterval);
    rooms[cleanRoomId].timerInterval = setInterval(() => {
      if (!rooms[cleanRoomId]) {
        return;
      }
      rooms[cleanRoomId].timerRemaining--;
      io.to(cleanRoomId).emit('room:timer', { remaining: rooms[cleanRoomId].timerRemaining });

      if (rooms[cleanRoomId].timerRemaining <= 0) {
        clearInterval(rooms[cleanRoomId].timerInterval);
        rooms[cleanRoomId].status = 'ended';
        io.to(cleanRoomId).emit('room:ended', { message: 'Discussion time is up!' });
      }
    }, 1000);
  });

  // End discussion manually
  socket.on('room:end', ({ roomId }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (!rooms[cleanRoomId]) return;
    if (rooms[cleanRoomId].timerInterval) clearInterval(rooms[cleanRoomId].timerInterval);
    rooms[cleanRoomId].status = 'ended';
    io.to(cleanRoomId).emit('room:ended', { message: 'Discussion ended by host.' });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);

    // Remove from any room
    for (const rId in rooms) {
      if (!rooms[rId] || !rooms[rId].participants) continue;
      const idx = rooms[rId].participants.findIndex(p => p.socketId === socket.id);
      if (idx !== -1) {
        const name = rooms[rId].participants[idx].name;
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
