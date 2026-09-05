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
    rooms[roomId] = {
      topic,
      participants: [],
      timerDuration: 10 * 60, // 10 minutes
      timerRemaining: 10 * 60,
      timerInterval: null,
      status: 'waiting'
    };

    const participant = { socketId: socket.id, userId, name: userName, isMuted: false, isConnected: true };
    rooms[roomId].participants.push(participant);
    socket.join(roomId);

    socket.emit('room:joined', {
      roomId,
      topic,
      participants: rooms[roomId].participants
    });

    console.log(`🏠 Room created: ${roomId} by ${userName}`);
  });

  // Join an existing room
  socket.on('room:join', ({ roomId, userName, userId }) => {
    if (!rooms[roomId]) {
      socket.emit('room:error', { message: `Room "${roomId}" does not exist. Please check the Room ID.` });
      return;
    }

    if (rooms[roomId].status === 'ended') {
      socket.emit('room:error', { message: 'This discussion has already ended.' });
      return;
    }

    const participant = { socketId: socket.id, userId, name: userName, isMuted: false, isConnected: true };
    rooms[roomId].participants.push(participant);
    socket.join(roomId);

    // Notify the joiner
    socket.emit('room:joined', {
      roomId,
      topic: rooms[roomId].topic,
      participants: rooms[roomId].participants
    });

    // Notify others in room
    socket.to(roomId).emit('room:participant_joined', {
      participant,
      participants: rooms[roomId].participants
    });

    console.log(`👤 ${userName} joined room: ${roomId}`);
  });

  // Send a chat message
  socket.on('room:message', ({ roomId, userName, message, timestamp }) => {
    const msgData = { userName, message, timestamp: timestamp || new Date().toISOString() };
    io.to(roomId).emit('room:message', msgData);
  });

  // Mute/unmute toggle
  socket.on('room:toggle_mute', ({ roomId, isMuted }) => {
    if (rooms[roomId]) {
      const participant = rooms[roomId].participants.find(p => p.socketId === socket.id);
      if (participant) {
        participant.isMuted = isMuted;
        io.to(roomId).emit('room:participants_update', rooms[roomId].participants);
      }
    }
  });

  // Start the discussion timer
  socket.on('room:start', ({ roomId, duration }) => {
    if (!rooms[roomId]) return;

    rooms[roomId].status = 'active';
    rooms[roomId].timerDuration = duration || 10 * 60;
    rooms[roomId].timerRemaining = rooms[roomId].timerDuration;

    io.to(roomId).emit('room:started', { topic: rooms[roomId].topic });

    // Start timer
    rooms[roomId].timerInterval = setInterval(() => {
      if (!rooms[roomId]) {
        return;
      }
      rooms[roomId].timerRemaining--;
      io.to(roomId).emit('room:timer', { remaining: rooms[roomId].timerRemaining });

      if (rooms[roomId].timerRemaining <= 0) {
        clearInterval(rooms[roomId].timerInterval);
        rooms[roomId].status = 'ended';
        io.to(roomId).emit('room:ended', { message: 'Discussion time is up!' });
      }
    }, 1000);
  });

  // End discussion manually
  socket.on('room:end', ({ roomId }) => {
    if (!rooms[roomId]) return;
    if (rooms[roomId].timerInterval) clearInterval(rooms[roomId].timerInterval);
    rooms[roomId].status = 'ended';
    io.to(roomId).emit('room:ended', { message: 'Discussion ended by host.' });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);

    // Remove from any room
    for (const roomId in rooms) {
      const idx = rooms[roomId].participants.findIndex(p => p.socketId === socket.id);
      if (idx !== -1) {
        const name = rooms[roomId].participants[idx].name;
        rooms[roomId].participants.splice(idx, 1);

        socket.to(roomId).emit('room:participant_left', {
          name,
          participants: rooms[roomId].participants
        });

        // Clean up empty rooms
        if (rooms[roomId].participants.length === 0) {
          if (rooms[roomId].timerInterval) clearInterval(rooms[roomId].timerInterval);
          delete rooms[roomId];
          console.log(`🗑️  Room ${roomId} cleaned up (empty)`);
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

// ─── START SERVER ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('🚀 ========================================');
  console.log(`🎯  GD Simulator Server Running!`);
  console.log(`🌐  http://localhost:${PORT}`);
  console.log(`📊  API: http://localhost:${PORT}/api/health`);
  console.log('🚀 ========================================');
  console.log('');
});

module.exports = { app, server, io };
