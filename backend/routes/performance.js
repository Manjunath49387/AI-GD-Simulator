const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/performance/history ───────────────────────────────────────────
router.get('/history', authMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  const history = db.prepare(`
    SELECT 
      s.session_id, s.mode, s.topic, s.category, s.duration, s.created_at,
      p.overall_score, p.communication_score, p.fluency_score, p.content_score,
      p.confidence_score, p.leadership_score, p.teamwork_score, p.critical_thinking,
      p.speaking_turns, p.total_words
    FROM gd_sessions s
    JOIN performance p ON s.session_id = p.session_id
    WHERE s.user_id = ? AND s.status = 'completed'
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.user_id, limit, offset);

  const total = db.prepare(`
    SELECT COUNT(*) as count 
    FROM gd_sessions s 
    JOIN performance p ON s.session_id = p.session_id
    WHERE s.user_id = ? AND s.status = 'completed'
  `).get(req.user.user_id);

  res.json({ history, total: total.count });
});

// ─── GET /api/performance/stats ──────────────────────────────────────────────
router.get('/stats', authMiddleware, (req, res) => {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_gds,
      ROUND(AVG(p.overall_score), 1) as avg_score,
      ROUND(MAX(p.overall_score), 1) as best_score,
      ROUND(MIN(p.overall_score), 1) as min_score,
      ROUND(AVG(p.communication_score), 1) as avg_communication,
      ROUND(AVG(p.fluency_score), 1) as avg_fluency,
      ROUND(AVG(p.vocabulary_score), 1) as avg_vocabulary,
      ROUND(AVG(p.content_score), 1) as avg_content,
      ROUND(AVG(p.confidence_score), 1) as avg_confidence,
      ROUND(AVG(p.leadership_score), 1) as avg_leadership,
      ROUND(AVG(p.teamwork_score), 1) as avg_teamwork,
      ROUND(AVG(p.critical_thinking), 1) as avg_critical_thinking,
      SUM(s.duration) as total_practice_time,
      SUM(p.total_words) as total_words_spoken
    FROM performance p
    JOIN gd_sessions s ON p.session_id = s.session_id
    WHERE p.user_id = ?
  `).get(req.user.user_id);

  // Get score progression for chart
  const progression = db.prepare(`
    SELECT 
      p.overall_score, 
      p.communication_score,
      p.content_score,
      s.created_at,
      s.topic
    FROM performance p
    JOIN gd_sessions s ON p.session_id = s.session_id
    WHERE p.user_id = ?
    ORDER BY s.created_at ASC
    LIMIT 20
  `).all(req.user.user_id);

  res.json({ stats, progression });
});

// ─── GET /api/performance/:sessionId ────────────────────────────────────────
router.get('/:sessionId', authMiddleware, (req, res) => {
  const perf = db.prepare(`
    SELECT p.*, s.topic, s.mode, s.category, s.duration, s.created_at
    FROM performance p
    JOIN gd_sessions s ON p.session_id = s.session_id
    WHERE p.session_id = ? AND p.user_id = ?
  `).get(req.params.sessionId, req.user.user_id);

  if (!perf) {
    return res.status(404).json({ error: 'Performance record not found.' });
  }

  // Parse JSON fields
  try { perf.strengths = JSON.parse(perf.strengths); } catch { perf.strengths = []; }
  try { perf.improvements = JSON.parse(perf.improvements); } catch { perf.improvements = []; }
  try { perf.recommendations = JSON.parse(perf.recommendations); } catch { perf.recommendations = []; }

  // Get transcript
  const transcript = db.prepare(
    'SELECT * FROM gd_transcripts WHERE session_id = ? ORDER BY timestamp ASC'
  ).all(req.params.sessionId);

  res.json({ performance: perf, transcript });
});

module.exports = router;
