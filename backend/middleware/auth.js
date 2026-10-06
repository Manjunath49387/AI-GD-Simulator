const jwt = require('jsonwebtoken');
const { supabase } = require('../utils/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'gd_simulator_secret';

/**
 * Middleware: Verify auth token from Authorization header.
 * Supports both Supabase JWT tokens and legacy local JWT tokens.
 * Attaches decoded user to req.user with { user_id, name, email }.
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please log in.' });
  }

  const token = authHeader.split(' ')[1];

  // ─── Try Supabase token verification first ────────────────────────────────
  if (supabase) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (user && !error) {
        // Supabase token is valid — extract user info
        // user_id will be resolved from SQLite by matching supabase_uid or email
        const db = require('../db');
        let dbUser = db.prepare('SELECT user_id, name, email FROM users WHERE supabase_uid = ?').get(user.id);

        if (!dbUser) {
          // Fallback: match by email
          dbUser = db.prepare('SELECT user_id, name, email FROM users WHERE email = ?').get(user.email);
          if (dbUser) {
            // Link Supabase UID to existing user
            db.prepare('UPDATE users SET supabase_uid = ? WHERE user_id = ?').run(user.id, dbUser.user_id);
          }
        }

        if (dbUser) {
          req.user = {
            user_id: dbUser.user_id,
            name: dbUser.name,
            email: dbUser.email,
            supabase_uid: user.id
          };
          return next();
        }

        // User exists in Supabase but not in SQLite — auto-create
        const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';
        const email = user.email;

        try {
          const result = db.prepare(
            'INSERT INTO users (name, email, password, supabase_uid) VALUES (?, ?, ?, ?)'
          ).run(name, email, '__supabase_auth__', user.id);

          req.user = {
            user_id: Number(result.lastInsertRowid),
            name,
            email,
            supabase_uid: user.id
          };
          return next();
        } catch (insertErr) {
          // Race condition — another request may have inserted. Try fetching again.
          dbUser = db.prepare('SELECT user_id, name, email FROM users WHERE email = ?').get(email);
          if (dbUser) {
            db.prepare('UPDATE users SET supabase_uid = ? WHERE user_id = ?').run(user.id, dbUser.user_id);
            req.user = { user_id: dbUser.user_id, name: dbUser.name, email: dbUser.email, supabase_uid: user.id };
            return next();
          }
          console.error('Supabase user sync error:', insertErr.message);
        }
      }
    } catch (supabaseErr) {
      // Supabase verification failed — fall through to legacy JWT
    }
  }

  // ─── Fallback: Legacy local JWT verification ──────────────────────────────
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token. Please log in.' });
  }
}

module.exports = authMiddleware;
