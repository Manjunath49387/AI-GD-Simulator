/**
 * /api/rooms — Human GD Room Management
 *
 * Persists room metadata and per-user session mappings in SQLite so that:
 *  1. Multiple users joining via the same room code each get their OWN gd_sessions row.
 *  2. Data survives server restarts / deployments (no in-memory-only state).
 *  3. After a discussion ends, each participant's individual session is evaluated separately.
 */

const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ─── POST /api/rooms/create ──────────────────────────────────────────────────
// Host creates a new room. Returns the room_id (short code) + host's session_id.
router.post('/create', authMiddleware, (req, res) => {
  const { topic, category, room_id } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Topic is required.' });
  }

  const cleanRoomId = room_id
    ? String(room_id).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
    : ('GD' + Math.floor(1000 + Math.random() * 9000));

  // Idempotent: if host already created this room, return their existing session
  const existing = db.prepare('SELECT * FROM human_rooms WHERE room_id = ?').get(cleanRoomId);
  if (existing) {
    const hostSession = db.prepare(
      "SELECT session_id FROM gd_sessions WHERE room_id = ? AND user_id = ? ORDER BY session_id DESC LIMIT 1"
    ).get(cleanRoomId, req.user.user_id);
    return res.json({ room_id: cleanRoomId, room: existing, session_id: hostSession?.session_id || null });
  }

  // Persist the room record
  db.prepare(`
    INSERT INTO human_rooms (room_id, topic, category, created_by, status)
    VALUES (?, ?, ?, ?, 'waiting')
  `).run(cleanRoomId, topic, category || 'General', req.user.user_id);

  // Create the host's individual gd_session for this room
  const sessionResult = db.prepare(`
    INSERT INTO gd_sessions (user_id, mode, topic, category, room_id, start_time, status)
    VALUES (?, 'human', ?, ?, ?, CURRENT_TIMESTAMP, 'active')
  `).run(req.user.user_id, topic, category || 'General', cleanRoomId);

  const sessionId = Number(sessionResult.lastInsertRowid);

  // Register host in room_participants
  try {
    db.prepare(`
      DELETE FROM room_participants WHERE room_id = ? AND user_id = ?
    `).run(cleanRoomId, req.user.user_id);
    db.prepare(`
      INSERT INTO room_participants (room_id, user_id, session_id, name, is_host)
      VALUES (?, ?, ?, ?, 1)
    `).run(cleanRoomId, req.user.user_id, sessionId, req.user.name);
  } catch (e) {
    console.warn('[Rooms] Host participant insert warn:', e.message);
  }

  const room = db.prepare('SELECT * FROM human_rooms WHERE room_id = ?').get(cleanRoomId);
  console.log(`🏠 Room created: ${cleanRoomId} by ${req.user.name} (session ${sessionId})`);
  res.status(201).json({ room_id: cleanRoomId, room, session_id: sessionId });
});

// ─── POST /api/rooms/join ────────────────────────────────────────────────────
// Participant joins an existing room by code.
// Always creates (or returns existing) a separate gd_session for THIS user.
router.post('/join', authMiddleware, (req, res) => {
  const { room_id } = req.body;
  if (!room_id) return res.status(400).json({ error: 'room_id is required.' });

  const cleanRoomId = String(room_id).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

  const room = db.prepare('SELECT * FROM human_rooms WHERE room_id = ?').get(cleanRoomId);
  if (!room) {
    return res.status(404).json({
      error: `Room "${cleanRoomId}" not found. Ask the host to share the correct code.`
    });
  }
  if (room.status === 'ended') {
    return res.status(410).json({ error: 'This discussion has already ended.' });
  }

  // Idempotent: return existing session if user already joined
  const existingSession = db.prepare(
    "SELECT session_id FROM gd_sessions WHERE room_id = ? AND user_id = ? ORDER BY session_id DESC LIMIT 1"
  ).get(cleanRoomId, req.user.user_id);

  let sessionId;
  if (existingSession) {
    sessionId = Number(existingSession.session_id);
    console.log(`🔄 ${req.user.name} re-joined room ${cleanRoomId} (session ${sessionId})`);
  } else {
    // Create a brand-new isolated session for this participant
    const result = db.prepare(`
      INSERT INTO gd_sessions (user_id, mode, topic, category, room_id, start_time, status)
      VALUES (?, 'human', ?, ?, ?, CURRENT_TIMESTAMP, 'active')
    `).run(req.user.user_id, room.topic, room.category || 'General', cleanRoomId);
    sessionId = Number(result.lastInsertRowid);
    console.log(`👤 ${req.user.name} joined room ${cleanRoomId} (new session ${sessionId})`);
  }

  // Upsert participant row
  try {
    db.prepare(`
      INSERT INTO room_participants (room_id, user_id, session_id, name, is_host)
      VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(room_id, user_id) DO UPDATE
        SET session_id = excluded.session_id,
            name       = excluded.name
    `).run(cleanRoomId, req.user.user_id, sessionId, req.user.name);
  } catch (e) {
    console.warn('[Rooms] Participant upsert warn:', e.message);
  }

  const participants = db.prepare(`
    SELECT rp.user_id, rp.name, rp.is_host, rp.session_id
    FROM room_participants rp
    WHERE rp.room_id = ?
    ORDER BY rp.joined_at ASC
  `).all(cleanRoomId);

  res.json({ room_id: cleanRoomId, room, session_id: sessionId, participants });
});

// ─── GET /api/rooms/:room_id ─────────────────────────────────────────────────
// Get room metadata + participants + sessionMap.
// Used on reconnect / page refresh to restore state.
router.get('/:room_id', authMiddleware, (req, res) => {
  const cleanRoomId = String(req.params.room_id || '').trim().toUpperCase();

  const room = db.prepare('SELECT * FROM human_rooms WHERE room_id = ?').get(cleanRoomId);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const participants = db.prepare(`
    SELECT rp.user_id, rp.name, rp.is_host, rp.is_muted, rp.session_id
    FROM room_participants rp
    WHERE rp.room_id = ?
    ORDER BY rp.joined_at ASC
  `).all(cleanRoomId);

  // sessionMap: { user_id -> session_id }  — used to route individual evaluations
  const sessionMap = {};
  participants.forEach(p => { if (p.session_id) sessionMap[p.user_id] = p.session_id; });

  res.json({ room, participants, sessionMap });
});

// ─── GET /api/rooms/:room_id/my-session ──────────────────────────────────────
// Returns the calling user's individual session_id for this room.
// Useful for reconnect when frontend has lost mySessionId from memory.
router.get('/:room_id/my-session', authMiddleware, (req, res) => {
  const cleanRoomId = String(req.params.room_id || '').trim().toUpperCase();

  const row = db.prepare(`
    SELECT session_id FROM gd_sessions
    WHERE room_id = ? AND user_id = ?
    ORDER BY session_id DESC LIMIT 1
  `).get(cleanRoomId, req.user.user_id);

  if (!row) return res.status(404).json({ error: 'No session found for this user in this room.' });
  res.json({ session_id: Number(row.session_id) });
});

// ─── POST /api/rooms/:room_id/start ──────────────────────────────────────────
// Host marks room as active in DB.
router.post('/:room_id/start', authMiddleware, (req, res) => {
  const cleanRoomId = String(req.params.room_id || '').trim().toUpperCase();

  const room = db.prepare('SELECT * FROM human_rooms WHERE room_id = ?').get(cleanRoomId);
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  if (room.created_by !== req.user.user_id) {
    return res.status(403).json({ error: 'Only the host can start the discussion.' });
  }

  db.prepare("UPDATE human_rooms SET status = 'active', started_at = CURRENT_TIMESTAMP WHERE room_id = ?")
    .run(cleanRoomId);

  res.json({ message: 'Discussion started.', room_id: cleanRoomId });
});

// ─── POST /api/rooms/:room_id/end ────────────────────────────────────────────
// Ends the room and all active sessions inside it.
// Returns sessionMap so every client knows their individual session_id.
router.post('/:room_id/end', authMiddleware, (req, res) => {
  const cleanRoomId = String(req.params.room_id || '').trim().toUpperCase();

  const room = db.prepare('SELECT * FROM human_rooms WHERE room_id = ?').get(cleanRoomId);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  // Mark room ended
  db.prepare(`
    UPDATE human_rooms
    SET status    = 'ended',
        ended_at  = CURRENT_TIMESTAMP,
        duration  = CAST((julianday('now') - julianday(COALESCE(started_at, created_at))) * 86400 AS INTEGER)
    WHERE room_id = ?
  `).run(cleanRoomId);

  // Complete all participant sessions in this room
  db.prepare(`
    UPDATE gd_sessions
    SET status   = 'completed',
        end_time = CURRENT_TIMESTAMP,
        duration = CAST((julianday('now') - julianday(start_time)) * 86400 AS INTEGER)
    WHERE room_id = ? AND status = 'active'
  `).run(cleanRoomId);

  const participants = db.prepare(`
    SELECT rp.user_id, rp.session_id, rp.name
    FROM room_participants rp
    WHERE rp.room_id = ?
  `).all(cleanRoomId);

  const sessionMap = {};
  participants.forEach(p => { if (p.session_id) sessionMap[p.user_id] = p.session_id; });

  console.log(`🏁 Room ${cleanRoomId} ended. sessionMap:`, sessionMap);
  res.json({ message: 'Room ended.', sessionMap, participants });
});

module.exports = router;
