require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// ─── Determine DB file path ───────────────────────────────────────────────────
// On Vercel serverless, /tmp is the only writable directory.
// We do NOT copy a pre-seeded .db file here because:
//   - Vercel runs multiple isolated function instances, each with their own /tmp
//   - Data created in one invocation is NOT visible to another instance
//   - Copying an old DB would embed stale foreign-key IDs causing FK failures
// Instead, we always start from an empty schema on every cold start.
let dbFilePath;
if (process.env.VERCEL) {
  dbFilePath = '/tmp/gd_simulator.db';
} else {
  dbFilePath = path.resolve(__dirname, process.env.DB_PATH || './gd_simulator.db');
}

const db = new DatabaseSync(dbFilePath);

// ─── PRAGMA setup ─────────────────────────────────────────────────────────────
// WAL mode requires a persistent filesystem — skip it on Vercel's /tmp
if (!process.env.VERCEL) {
  try { db.exec('PRAGMA journal_mode = WAL;'); } catch (e) {}
}
// Foreign keys must be enabled on every new connection
db.exec('PRAGMA foreign_keys = ON;');

// ─── transaction() polyfill (mirrors better-sqlite3 API) ─────────────────────
db.transaction = function (fn) {
  return function (...args) {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw err;
    }
  };
};

// ============================================================
// SCHEMA CREATION — runs directly (CREATE TABLE IF NOT EXISTS is idempotent)
// All columns, including migration columns, are included here so a fresh DB
// is fully initialized without needing to run ALTER TABLE migrations.
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    avatar       TEXT DEFAULT 'default',
    bio          TEXT DEFAULT '',
    supabase_uid TEXT UNIQUE,
    auth_provider TEXT DEFAULT 'local',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

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

db.exec(`
  CREATE TABLE IF NOT EXISTS performance (
    performance_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id               INTEGER UNIQUE NOT NULL REFERENCES gd_sessions(session_id) ON DELETE CASCADE,
    user_id                  INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    communication_score      REAL DEFAULT 0,
    fluency_score            REAL DEFAULT 0,
    vocabulary_score         REAL DEFAULT 0,
    content_score            REAL DEFAULT 0,
    confidence_score         REAL DEFAULT 0,
    leadership_score         REAL DEFAULT 0,
    teamwork_score           REAL DEFAULT 0,
    critical_thinking        REAL DEFAULT 0,
    participation_score      REAL DEFAULT 0,
    relevance_score          REAL DEFAULT 0,
    listening_score          REAL DEFAULT 0,
    conclusion_score         REAL DEFAULT 0,
    overall_score            REAL DEFAULT 0,
    strengths                TEXT DEFAULT '[]',
    improvements             TEXT DEFAULT '[]',
    recommendations          TEXT DEFAULT '[]',
    evidence                 TEXT DEFAULT '[]',
    practice_plan            TEXT DEFAULT '[]',
    placement_readiness      TEXT DEFAULT '',
    improvement_suggestions  TEXT DEFAULT '[]',
    full_feedback            TEXT DEFAULT '',
    score_projection         TEXT DEFAULT '{}',
    filler_word_count        INTEGER DEFAULT 0,
    total_words              INTEGER DEFAULT 0,
    speaking_turns           INTEGER DEFAULT 0,
    speaking_time_seconds    INTEGER DEFAULT 0,
    meaningful_contributions INTEGER DEFAULT 0,
    interruptions            INTEGER DEFAULT 0,
    repeated_points          INTEGER DEFAULT 0,
    responses_to_others      INTEGER DEFAULT 0,
    questions_asked          INTEGER DEFAULT 0,
    topic_deviations         INTEGER DEFAULT 0,
    created_at               DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

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

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sessions_user          ON gd_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_transcripts_session    ON gd_transcripts(session_id);
  CREATE INDEX IF NOT EXISTS idx_performance_user       ON performance(user_id);
  CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_id);
`);

// ============================================================
// MIGRATIONS — add any columns missing from pre-existing DBs
// (try/catch: silently skip if column already exists)
// ============================================================
const MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN supabase_uid TEXT UNIQUE`,
  `ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'`,
  `ALTER TABLE performance ADD COLUMN participation_score      REAL DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN relevance_score          REAL DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN listening_score          REAL DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN conclusion_score         REAL DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN speaking_time_seconds    INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN meaningful_contributions INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN interruptions            INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN repeated_points         INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN responses_to_others     INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN questions_asked         INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN topic_deviations        INTEGER DEFAULT 0`,
  `ALTER TABLE performance ADD COLUMN evidence               TEXT DEFAULT '[]'`,
  `ALTER TABLE performance ADD COLUMN practice_plan          TEXT DEFAULT '[]'`,
  `ALTER TABLE performance ADD COLUMN placement_readiness    TEXT DEFAULT ''`,
  `ALTER TABLE performance ADD COLUMN improvement_suggestions TEXT DEFAULT '[]'`,
  `ALTER TABLE performance ADD COLUMN score_projection       TEXT DEFAULT '{}'`,
];

for (const sql of MIGRATIONS) {
  try { db.exec(sql); } catch (_) { /* column already exists — skip */ }
}

console.log('✅ Database initialized successfully via node:sqlite:', dbFilePath);

module.exports = db;
