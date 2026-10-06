/**
 * supabase.js — Supabase client initialization
 * Used for Auth & Database integration.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('YOUR_PROJECT_REF') &&
  !SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY')
);

if (!isConfigured) {
  console.log('ℹ️  Supabase credentials not configured or set to placeholder. Operating in local SQLite mode.');
} else {
  console.log('✅ Supabase client initialized:', SUPABASE_URL);
}

// Public client (used for token verification with anon key)
const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Admin client (used for server-side user management — optional)
const supabaseAdmin = isConfigured && SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_SERVICE_ROLE_KEY.includes('YOUR_SERVICE_ROLE')
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

module.exports = {
  supabase,
  supabaseAdmin,
  SUPABASE_URL: isConfigured ? SUPABASE_URL : '',
  SUPABASE_ANON_KEY: isConfigured ? SUPABASE_ANON_KEY : '',
  isSupabaseConfigured: () => isConfigured
};
