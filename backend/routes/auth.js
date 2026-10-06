const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'gd_simulator_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ─── POST /api/auth/register ────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  // Check if email already exists locally
  const existing = db.prepare('SELECT user_id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  // ─── Try Supabase registration first ──────────────────────────────────────
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          data: { full_name: name.trim() }
        }
      });

      if (error) {
        console.warn('Supabase signup error:', error.message);
        if (error.message.toLowerCase().includes('already registered') || error.status === 400 && error.message.toLowerCase().includes('user already exists')) {
          return res.status(409).json({ error: 'An account with this email already exists in Supabase. Please sign in.' });
        }
      } else if (data?.user) {
        const supabaseUid = data.user.id;

        // Persist directly into Supabase's public.users PostgreSQL table
        try {
          const { error: pgError } = await supabase.from('users').upsert({
            supabase_uid: supabaseUid,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            auth_provider: 'supabase'
          }, { onConflict: 'email' });
          if (pgError) console.warn('Supabase DB users upsert note:', pgError.message);
          else console.log('✅ User account stored in Supabase database (public.users):', email);
        } catch (dbErr) {
          console.warn('Could not upsert into Supabase public.users:', dbErr.message);
        }

        // Create or update local SQLite user linked to Supabase
        const existingLocal = db.prepare('SELECT user_id FROM users WHERE email = ?').get(email.toLowerCase().trim());
        let userId;
        if (existingLocal) {
          db.prepare('UPDATE users SET supabase_uid = ?, name = ?, auth_provider = ? WHERE user_id = ?')
            .run(supabaseUid, name.trim(), 'supabase', existingLocal.user_id);
          userId = existingLocal.user_id;
        } else {
          const result = db.prepare(
            'INSERT INTO users (name, email, password, supabase_uid, auth_provider) VALUES (?, ?, ?, ?, ?)'
          ).run(name.trim(), email.toLowerCase().trim(), '__supabase_auth__', supabaseUid, 'supabase');
          userId = result.lastInsertRowid;
        }

        const user = db.prepare('SELECT user_id, name, email, avatar, created_at FROM users WHERE user_id = ?')
          .get(userId);

        const token = data.session?.access_token || jwt.sign(
          { user_id: user.user_id, name: user.name, email: user.email },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );

        return res.status(201).json({
          message: 'Account created and saved in Supabase database!',
          token,
          auth_provider: 'supabase',
          user: { user_id: user.user_id, name: user.name, email: user.email, avatar: user.avatar }
        });
      }
    } catch (supabaseErr) {
      console.warn('Supabase registration unavailable, using local auth:', supabaseErr.message);
    }
  }

  // ─── Fallback: Local registration ─────────────────────────────────────────
  const hashedPassword = bcrypt.hashSync(password, 10);

  const result = db.prepare(
    'INSERT INTO users (name, email, password, auth_provider) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), email.toLowerCase().trim(), hashedPassword, 'local');

  const user = db.prepare('SELECT user_id, name, email, avatar, created_at FROM users WHERE user_id = ?')
    .get(result.lastInsertRowid);

  const token = jwt.sign(
    { user_id: user.user_id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.status(201).json({
    message: 'Account created successfully!',
    token,
    auth_provider: 'local',
    user: { user_id: user.user_id, name: user.name, email: user.email, avatar: user.avatar }
  });
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  // ─── Try Supabase login first ─────────────────────────────────────────────
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password
      });

      if (!error && data?.user && data?.session) {
        const supabaseUid = data.user.id;
        const accessToken = data.session.access_token;
        const fullName = data.user.user_metadata?.full_name || data.user.user_metadata?.name || email.split('@')[0];

        // Ensure user account is stored/updated in Supabase's public.users table
        try {
          await supabase.from('users').upsert({
            supabase_uid: supabaseUid,
            name: fullName,
            email: email.toLowerCase().trim(),
            auth_provider: 'supabase'
          }, { onConflict: 'email' });
          console.log('✅ User account verified and synced in Supabase database:', email);
        } catch (dbErr) {
          console.warn('Could not sync to Supabase public.users:', dbErr.message);
        }

        // Find or create local user
        let dbUser = db.prepare('SELECT user_id, name, email, avatar FROM users WHERE supabase_uid = ?').get(supabaseUid);

        if (!dbUser) {
          dbUser = db.prepare('SELECT user_id, name, email, avatar FROM users WHERE email = ?').get(email.toLowerCase().trim());
          if (dbUser) {
            // Link existing local user to Supabase
            db.prepare('UPDATE users SET supabase_uid = ?, auth_provider = ? WHERE user_id = ?')
              .run(supabaseUid, 'supabase', dbUser.user_id);
          } else {
            // Auto-create local user from Supabase
            const result = db.prepare(
              'INSERT INTO users (name, email, password, supabase_uid, auth_provider) VALUES (?, ?, ?, ?, ?)'
            ).run(fullName, email.toLowerCase().trim(), '__supabase_auth__', supabaseUid, 'supabase');
            dbUser = db.prepare('SELECT user_id, name, email, avatar FROM users WHERE user_id = ?')
              .get(result.lastInsertRowid);
          }
        }

        return res.json({
          message: 'Login successful via Supabase!',
          token: accessToken,
          auth_provider: 'supabase',
          user: { user_id: dbUser.user_id, name: dbUser.name, email: dbUser.email, avatar: dbUser.avatar }
        });
      }
    } catch (supabaseErr) {
      console.warn('Supabase login unavailable, trying local auth:', supabaseErr.message);
    }
  }

  // ─── Fallback: Local login ────────────────────────────────────────────────
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Users created via Supabase Auth don't have a local password
  if (user.password === '__supabase_auth__') {
    return res.status(401).json({ error: 'This account uses Supabase Auth. Please check your credentials.' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // If Supabase is active, try auto-migrating this local account into Supabase!
  if (supabase) {
    try {
      const { data: suData } = await supabase.auth.signUp({
        email: user.email,
        password: password,
        options: { data: { full_name: user.name } }
      });
      if (suData?.user) {
        db.prepare('UPDATE users SET supabase_uid = ?, auth_provider = ? WHERE user_id = ?')
          .run(suData.user.id, 'supabase', user.user_id);
        await supabase.from('users').upsert({
          supabase_uid: suData.user.id,
          name: user.name,
          email: user.email,
          auth_provider: 'supabase'
        }, { onConflict: 'email' });
        console.log('✅ Existing local account migrated to Supabase database:', user.email);
      }
    } catch (migErr) {
      // Ignore migration error, local login still succeeds
    }
  }

  const token = jwt.sign(
    { user_id: user.user_id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.json({
    message: 'Login successful!',
    token,
    auth_provider: 'local',
    user: { user_id: user.user_id, name: user.name, email: user.email, avatar: user.avatar }
  });
});

// ─── POST /api/auth/supabase-callback ───────────────────────────────────────
// Called by frontend after successful Supabase social login (Google/GitHub)
// Syncs the Supabase user to the local SQLite database
router.post('/supabase-callback', async (req, res) => {
  const { access_token } = req.body;

  if (!access_token) {
    return res.status(400).json({ error: 'Access token is required.' });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured on this server.' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(access_token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid Supabase token.' });
    }

    const email = user.email;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.preferred_username || email?.split('@')[0] || 'User';
    const avatar = user.user_metadata?.avatar_url || 'default';
    const provider = user.app_metadata?.provider || 'supabase';

    // Ensure OAuth user is persisted directly into Supabase's public.users table
    try {
      await supabase.from('users').upsert({
        supabase_uid: user.id,
        name,
        email,
        auth_provider: provider,
        avatar: avatar !== 'default' ? avatar : null
      }, { onConflict: 'email' });
      console.log('✅ OAuth user saved in Supabase database:', email);
    } catch (sbErr) {
      console.warn('Could not upsert OAuth user into Supabase users table:', sbErr.message);
    }

    // Find or create local user
    let dbUser = db.prepare('SELECT user_id, name, email, avatar FROM users WHERE supabase_uid = ?').get(user.id);

    if (!dbUser) {
      dbUser = db.prepare('SELECT user_id, name, email, avatar FROM users WHERE email = ?').get(email);
      if (dbUser) {
        // Link existing user to Supabase
        db.prepare('UPDATE users SET supabase_uid = ?, auth_provider = ?, avatar = COALESCE(?, avatar) WHERE user_id = ?')
          .run(user.id, provider, avatar !== 'default' ? avatar : null, dbUser.user_id);
      } else {
        // Create new local user
        const result = db.prepare(
          'INSERT INTO users (name, email, password, supabase_uid, auth_provider, avatar) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(name, email, '__supabase_auth__', user.id, provider, avatar);
        dbUser = db.prepare('SELECT user_id, name, email, avatar FROM users WHERE user_id = ?')
          .get(result.lastInsertRowid);
      }
    }

    res.json({
      message: 'Social login synced successfully!',
      token: access_token,
      auth_provider: provider,
      user: { user_id: dbUser.user_id, name: dbUser.name, email: dbUser.email, avatar: dbUser.avatar }
    });
  } catch (err) {
    console.error('Supabase callback error:', err.message);
    res.status(500).json({ error: 'Failed to sync social login.' });
  }
});

// ─── GET /api/auth/profile ───────────────────────────────────────────────────
router.get('/profile', authMiddleware, (req, res) => {
  const user = db.prepare(
    'SELECT user_id, name, email, avatar, bio, auth_provider, created_at FROM users WHERE user_id = ?'
  ).get(req.user.user_id);

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Get stats
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_gds,
      AVG(p.overall_score) as avg_score,
      MAX(p.overall_score) as best_score
    FROM performance p
    WHERE p.user_id = ?
  `).get(req.user.user_id);

  res.json({ user, stats });
});

// ─── PUT /api/auth/profile ───────────────────────────────────────────────────
router.put('/profile', authMiddleware, (req, res) => {
  const { name, bio, avatar } = req.body;

  db.prepare(
    'UPDATE users SET name = COALESCE(?, name), bio = COALESCE(?, bio), avatar = COALESCE(?, avatar), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(name, bio, avatar, req.user.user_id);

  const user = db.prepare(
    'SELECT user_id, name, email, avatar, bio FROM users WHERE user_id = ?'
  ).get(req.user.user_id);

  res.json({ message: 'Profile updated!', user });
});

// ─── PUT /api/auth/password ──────────────────────────────────────────────────
router.put('/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(req.user.user_id);

  // For Supabase users, update password via Supabase API
  if (user.auth_provider !== 'local' && supabase && req.user.supabase_uid) {
    try {
      // Supabase password update requires the user's session token
      const token = req.headers['authorization']?.split(' ')[1];
      if (token) {
        const { error } = await supabase.auth.updateUser(
          { password: newPassword },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (error) {
          return res.status(400).json({ error: 'Failed to update password: ' + error.message });
        }
        return res.json({ message: 'Password changed successfully via Supabase!' });
      }
    } catch (err) {
      console.warn('Supabase password update failed:', err.message);
    }
  }

  // Local password change
  if (user.password === '__supabase_auth__') {
    return res.status(400).json({ error: 'This account uses social login. Password cannot be changed here.' });
  }

  const valid = bcrypt.compareSync(currentPassword, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
    .run(hashed, req.user.user_id);

  res.json({ message: 'Password changed successfully!' });
});

// ─── GET /api/auth/supabase-config ──────────────────────────────────────────
// Returns Supabase config for frontend initialization (safe — anon key only)
router.get('/supabase-config', (req, res) => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('../utils/supabase');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.json({ enabled: false });
  }

  res.json({
    enabled: true,
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY
  });
});

module.exports = router;
