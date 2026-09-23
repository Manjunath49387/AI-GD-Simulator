require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './gd_simulator.db';
const db = new DatabaseSync(path.resolve(__dirname, DB_PATH));

// Enable WAL mode & foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Polyfill transaction method for compatibility with better-sqlite3 callers
db.transaction = function (fn) {
  return function (...args) {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

// ============================================================
// SCHEMA CREATION
// ============================================================

const createTables = db.transaction(() => {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      avatar     TEXT DEFAULT 'default',
      bio        TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // GD Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS gd_sessions (
      session_id  INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      mode        TEXT NOT NULL CHECK(mode IN ('ai', 'human')),
      topic       TEXT NOT NULL,
      category    TEXT DEFAULT 'General',
      room_id     TEXT,
      start_time  DATETIME,
      end_time    DATETIME,
      duration    INTEGER DEFAULT 0,
      status      TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'abandoned')),
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // GD Transcripts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS gd_transcripts (
      transcript_id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    INTEGER NOT NULL REFERENCES gd_sessions(session_id) ON DELETE CASCADE,
      speaker       TEXT NOT NULL,
      speaker_type  TEXT DEFAULT 'user' CHECK(speaker_type IN ('user', 'ai', 'system')),
      message       TEXT NOT NULL,
      word_count    INTEGER DEFAULT 0,
      timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Performance table
  db.exec(`
    CREATE TABLE IF NOT EXISTS performance (
      performance_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id           INTEGER UNIQUE NOT NULL REFERENCES gd_sessions(session_id) ON DELETE CASCADE,
      user_id              INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      communication_score  REAL DEFAULT 0,
      fluency_score        REAL DEFAULT 0,
      vocabulary_score     REAL DEFAULT 0,
      content_score        REAL DEFAULT 0,
      confidence_score     REAL DEFAULT 0,
      leadership_score     REAL DEFAULT 0,
      teamwork_score       REAL DEFAULT 0,
      critical_thinking    REAL DEFAULT 0,
      overall_score        REAL DEFAULT 0,
      strengths            TEXT DEFAULT '[]',
      improvements         TEXT DEFAULT '[]',
      recommendations      TEXT DEFAULT '[]',
      full_feedback        TEXT DEFAULT '',
      filler_word_count    INTEGER DEFAULT 0,
      total_words          INTEGER DEFAULT 0,
      speaking_turns       INTEGER DEFAULT 0,
      created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Human Mode Room Participants
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_participants (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id    TEXT NOT NULL,
      user_id    INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      name       TEXT NOT NULL,
      socket_id  TEXT,
      is_muted   INTEGER DEFAULT 0,
      joined_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON gd_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transcripts_session ON gd_transcripts(session_id);
    CREATE INDEX IF NOT EXISTS idx_performance_user ON performance(user_id);
    CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_id);
  `);
});

createTables();

// ============================================================
// MIGRATIONS — safely add new columns if they don't exist yet
// (node:sqlite has no IF NOT EXISTS for ADD COLUMN, so we try/catch)
// ============================================================
const MIGRATIONS = [
  // ── New 10-metric scoring columns ──────────────────────────
  `ALTER TABLE performance ADD COLUMN participation_score  REAL DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN relevance_score      REAL DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN listening_score      REAL DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN conclusion_score     REAL DEFAULT 0`,
  // ── Behavioral metric columns ───────────────────────────────
  `ALTER TABLE performance ADD COLUMN speaking_time_seconds    INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN meaningful_contributions INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN interruptions            INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN repeated_points         INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN responses_to_others     INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN questions_asked         INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN topic_deviations        INTEGER DEFAULT 0`,
  // ── Extended feedback columns ───────────────────────────────
  `ALTER TABLE performance ADD COLUMN evidence               TEXT DEFAULT '[]'`,
  `ALTER TABLE performance ADD COLUMN practice_plan          TEXT DEFAULT '[]'`,
  `ALTER TABLE performance ADD COLUMN placement_readiness    TEXT DEFAULT ''`,
  `ALTER TABLE performance ADD COLUMN improvement_suggestions TEXT DEFAULT '[]'`,
];

for (const sql of MIGRATIONS) {
  try {
    db.exec(sql);
  } catch (_) {
    // Column already exists — silently skip
  }
}

console.log('✅ Database initialized successfully via node:sqlite:', DB_PATH);

module.exports = db;
