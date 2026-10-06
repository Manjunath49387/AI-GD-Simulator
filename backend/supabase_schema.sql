-- ============================================================
-- GD SIMULATOR — SUPABASE POSTGRESQL DATABASE SCHEMA
-- ============================================================
-- Run this script in your Supabase Dashboard:
-- 1. Go to https://supabase.com -> Project -> SQL Editor
-- 2. Click "New Query"
-- 3. Paste this entire file and click "Run"
-- ============================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- 1. USERS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    user_id          BIGSERIAL PRIMARY KEY,
    supabase_uid     UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    email            TEXT UNIQUE NOT NULL,
    password         TEXT DEFAULT '',
    avatar           TEXT DEFAULT 'default',
    bio              TEXT DEFAULT '',
    auth_provider    TEXT DEFAULT 'local',
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by email and supabase_uid
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON public.users(supabase_uid);

-- ------------------------------------------------------------
-- 2. GD SESSIONS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gd_sessions (
    session_id       BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    mode             VARCHAR(20) NOT NULL CHECK (mode IN ('ai', 'human')),
    topic            TEXT NOT NULL,
    category         VARCHAR(100) DEFAULT 'General',
    room_id          VARCHAR(100),
    start_time       TIMESTAMPTZ,
    end_time         TIMESTAMPTZ,
    duration         INTEGER DEFAULT 0,
    status           VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.gd_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_room_id ON public.gd_sessions(room_id);

-- ------------------------------------------------------------
-- 3. GD TRANSCRIPTS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gd_transcripts (
    transcript_id    BIGSERIAL PRIMARY KEY,
    session_id       BIGINT NOT NULL REFERENCES public.gd_sessions(session_id) ON DELETE CASCADE,
    speaker          VARCHAR(100) NOT NULL,
    speaker_type     VARCHAR(20) DEFAULT 'user' CHECK (speaker_type IN ('user', 'ai', 'system')),
    message          TEXT NOT NULL,
    word_count       INTEGER DEFAULT 0,
    timestamp        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcripts_session_id ON public.gd_transcripts(session_id);

-- ------------------------------------------------------------
-- 4. PERFORMANCE / EVALUATIONS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.performance (
    performance_id           BIGSERIAL PRIMARY KEY,
    session_id               BIGINT UNIQUE NOT NULL REFERENCES public.gd_sessions(session_id) ON DELETE CASCADE,
    user_id                  BIGINT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    communication_score      NUMERIC(5,2) DEFAULT 0,
    fluency_score            NUMERIC(5,2) DEFAULT 0,
    vocabulary_score         NUMERIC(5,2) DEFAULT 0,
    content_score            NUMERIC(5,2) DEFAULT 0,
    confidence_score         NUMERIC(5,2) DEFAULT 0,
    leadership_score         NUMERIC(5,2) DEFAULT 0,
    teamwork_score           NUMERIC(5,2) DEFAULT 0,
    critical_thinking        NUMERIC(5,2) DEFAULT 0,
    participation_score      NUMERIC(5,2) DEFAULT 0,
    relevance_score          NUMERIC(5,2) DEFAULT 0,
    listening_score          NUMERIC(5,2) DEFAULT 0,
    conclusion_score         NUMERIC(5,2) DEFAULT 0,
    overall_score            NUMERIC(5,2) DEFAULT 0,
    strengths                JSONB DEFAULT '[]'::jsonb,
    improvements             JSONB DEFAULT '[]'::jsonb,
    recommendations          JSONB DEFAULT '[]'::jsonb,
    evidence                 JSONB DEFAULT '[]'::jsonb,
    practice_plan            JSONB DEFAULT '[]'::jsonb,
    placement_readiness      TEXT DEFAULT '',
    improvement_suggestions  JSONB DEFAULT '[]'::jsonb,
    full_feedback            TEXT DEFAULT '',
    score_projection         JSONB DEFAULT '{}'::jsonb,
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
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_user_id ON public.performance(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_session_id ON public.performance(session_id);

-- ------------------------------------------------------------
-- 5. ROOM PARTICIPANTS (Multiplayer / Live Rooms)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_participants (
    id         BIGSERIAL PRIMARY KEY,
    room_id    VARCHAR(100) NOT NULL,
    user_id    BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
    name       VARCHAR(100) NOT NULL,
    socket_id  VARCHAR(100),
    joined_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_participants_room_id ON public.room_participants(room_id);

-- ------------------------------------------------------------
-- 6. DISABLE RLS & REMOVE RESTRICTIVE TRIGGERS
-- ------------------------------------------------------------
-- Drop conflicting triggers if any were created previously
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Allow authenticated write users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated read users" ON public.users;
DROP POLICY IF EXISTS "Allow user access own sessions" ON public.gd_sessions;
DROP POLICY IF EXISTS "Allow access transcripts" ON public.gd_transcripts;
DROP POLICY IF EXISTS "Allow access performance" ON public.performance;
DROP POLICY IF EXISTS "Allow access room participants" ON public.room_participants;

-- Disable Row Level Security so backend API and clients can read/write seamlessly
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.gd_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.gd_transcripts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants DISABLE ROW LEVEL SECURITY;

-- Grant standard permissions
GRANT ALL ON TABLE public.users TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.gd_sessions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.gd_transcripts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.performance TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.room_participants TO anon, authenticated, service_role;
