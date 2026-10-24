/**
 * Seed Script for AI Group Discussion Simulator
 * Populates multiple distinct user accounts, completed GD sessions,
 * realistic transcripts, and diagnostic performance scores.
 * Run with: node sample_data/seed.js
 */

const bcrypt = require('../backend/node_modules/bcryptjs');
const db = require('../backend/db');

console.log('🌱 Seeding multi-user database...');

const SEED_USERS = [
  {
    name: 'Alex Morgan',
    email: 'demo@gd.com',
    password: 'demo123',
    bio: 'Tech & AI Aspirant preparing for Tier-1 engineering & campus placement GDs.',
    avatar: 'default',
    sessions: [
      {
        topic: 'Is Artificial Intelligence replacing human creativity or augmenting it?',
        category: 'Everyday Technology',
        mode: 'ai',
        duration: 720,
        scores: {
          comm: 84, fluency: 82, vocab: 86, content: 88, conf: 85, lead: 80, team: 88, crit: 90, overall: 85,
          filler_words: 3, total_words: 290, turns: 4,
          strengths: [
            'Excellent framing distinguishing procedural automation from conceptual creativity',
            'Polite yet firm interjections when navigating opposing viewpoints',
            'Strong real-world references to generative design and developer productivity'
          ],
          improvements: [
            'Could have synthesized unanimous consensus during the final 60 seconds',
            'Noticeable pause before transitioning into ethical copyright concerns'
          ],
          recommendations: [
            'Practice summarizing team viewpoints when acting as concluding speaker',
            'Cite balanced empirical case studies in introductory hooks'
          ],
          full_feedback: 'Alex displayed remarkable clarity and structured reasoning throughout this discussion. You entered early with high confidence and supported arguments with practical industry examples.'
        },
        transcripts: [
          { speaker: 'Moderator', type: 'system', message: 'Welcome to this Group Discussion on AI and Human Creativity. The floor is open.' },
          { speaker: 'Alex Morgan (You)', type: 'user', message: 'Good afternoon everyone. I believe AI should be viewed as an amplifier rather than an adversary to human ingenuity.' },
          { speaker: 'Vikram', type: 'ai', message: 'While that sounds optimistic, generative models today generate media that threatens creator livelihoods.' },
          { speaker: 'Alex Morgan (You)', type: 'user', message: 'Vikram makes a valid point regarding attribution. However, raw model output still requires human curation and emotional authenticity.' }
        ]
      },
      {
        topic: 'Work From Home vs Work From Office: Finding the Sustainable Balance',
        category: 'Career & Workplace',
        mode: 'ai',
        duration: 600,
        scores: {
          comm: 80, fluency: 78, vocab: 82, content: 84, conf: 79, lead: 75, team: 85, crit: 82, overall: 81,
          filler_words: 4, total_words: 240, turns: 3,
          strengths: ['Balanced employee wellbeing with corporate mentorship', 'Acknowledged prior speakers respectfully'],
          improvements: ['Opening hook could be punchier', 'Avoid repetitive transition phrasing'],
          recommendations: ['Structure arguments into 3 parts: Point, Evidence, and Impact'],
          full_feedback: 'A solid, mature discussion demonstrating high conversational empathy and balanced corporate policy thinking.'
        },
        transcripts: [
          { speaker: 'Moderator', type: 'system', message: 'Topic initiated: Work From Home vs Work From Office.' },
          { speaker: 'Alex Morgan (You)', type: 'user', message: 'Remote flexibility democratizes hiring, but hybrid in-person collaboration remains critical for spontaneous mentorship.' }
        ]
      }
    ]
  },
  {
    name: 'Sarah Chen',
    email: 'sarah@gd.com',
    password: 'demo123',
    bio: 'Management & Consulting Aspirant focused on structured case analysis and team consensus.',
    avatar: 'default',
    sessions: [
      {
        topic: 'Is a College Degree still necessary to build a successful career today?',
        category: 'Campus & College',
        mode: 'ai',
        duration: 660,
        scores: {
          comm: 88, fluency: 86, vocab: 89, content: 91, conf: 88, lead: 86, team: 92, crit: 89, overall: 88,
          filler_words: 2, total_words: 310, turns: 5,
          strengths: [
            'Exceptional structured framework: split the discussion into skills, credentials, and alumni networks',
            'Encouraged quieter peers to share experiences',
            'Strong closing summary that aligned with interviewer expectations'
          ],
          improvements: ['Could incorporate more specific data points from startup hiring reports'],
          recommendations: ['Ready for competitive final placement GD rounds'],
          full_feedback: 'Outstanding leadership and articulate clarity. Sarah structured the discussion and guided the team towards an actionable conclusion.'
        },
        transcripts: [
          { speaker: 'Moderator', type: 'system', message: 'Discussion begins: Is a College Degree still necessary?' },
          { speaker: 'Sarah Chen (You)', type: 'user', message: 'Let us examine this across two dimensions: self-taught technical skills versus the institutional credibility degrees provide in regulated fields.' }
        ]
      },
      {
        topic: 'Fast Food & Food Delivery Apps vs Home Cooking & Healthy Habits',
        category: 'Society & Lifestyle',
        mode: 'human',
        duration: 540,
        scores: {
          comm: 82, fluency: 80, vocab: 84, content: 83, conf: 81, lead: 78, team: 86, crit: 85, overall: 83,
          filler_words: 3, total_words: 260, turns: 4,
          strengths: ['Great economic analysis of cloud kitchens vs nutrition costs', 'Calm and persuasive tone'],
          improvements: ['Could challenge counter-arguments more assertively'],
          recommendations: ['Practice interjecting politely when discussions speed up'],
          full_feedback: 'Very engaging peer discussion. Sarah kept the focus on consumer convenience vs healthcare impacts.'
        },
        transcripts: [
          { speaker: 'Host', type: 'system', message: 'Peer discussion started in room FOOD-HEALTH.' },
          { speaker: 'Sarah Chen (You)', type: 'user', message: 'Delivery apps optimize time for working professionals, but the societal cost appears in long-term preventive health.' }
        ]
      }
    ]
  },
  {
    name: 'Rahul Sharma',
    email: 'rahul@gd.com',
    password: 'demo123',
    bio: 'Engineering Graduate preparing for software and core campus recruitment drives.',
    avatar: 'default',
    sessions: [
      {
        topic: 'Electric Vehicles (EVs) vs Petrol/Diesel: Are EVs practically ready for everyone?',
        category: 'Everyday Technology',
        mode: 'ai',
        duration: 580,
        scores: {
          comm: 75, fluency: 72, vocab: 76, content: 78, conf: 74, lead: 70, team: 80, crit: 79, overall: 76,
          filler_words: 6, total_words: 220, turns: 3,
          strengths: ['Technical depth on battery charging infrastructure and range anxiety', 'Respectful active listening'],
          improvements: ['Work on vocal projection and reducing filler words like "um" and "basically"'],
          recommendations: ['Use the 3-second pause technique before answering objections'],
          full_feedback: 'Good technical understanding of automotive transitions. Focus on vocal fluency and clear opening hooks.'
        },
        transcripts: [
          { speaker: 'Moderator', type: 'system', message: 'Discussion initiated: Electric Vehicles readiness.' },
          { speaker: 'Rahul Sharma (You)', type: 'user', message: 'While EV adoption is growing in tier-1 cities, grid stability and rural charging networks need massive investment first.' }
        ]
      }
    ]
  },
  {
    name: 'Priya Patel',
    email: 'priya@gd.com',
    password: 'demo123',
    bio: 'Product Management Aspirant specializing in user-centric communication and strategic GD moderation.',
    avatar: 'default',
    sessions: [
      {
        topic: 'Social Media: Is it connecting people more or making youth feel lonelier?',
        category: 'Everyday Technology',
        mode: 'ai',
        duration: 700,
        scores: {
          comm: 87, fluency: 86, vocab: 88, content: 90, conf: 89, lead: 88, team: 91, crit: 90, overall: 89,
          filler_words: 1, total_words: 340, turns: 5,
          strengths: [
            'Empathetic yet analytical discussion of algorithm-driven isolation vs community building',
            'Strong moderation skills, brought the topic back when peers strayed',
            'Crisp, professional vocabulary and engaging cadence'
          ],
          improvements: ['Could provide one actionable regulatory solution in the closing remarks'],
          recommendations: ['Outstanding candidate ready for top-tier corporate GDs'],
          full_feedback: 'Top-tier performance. Priya demonstrated rare poise, active moderation, and rich argumentative depth.'
        },
        transcripts: [
          { speaker: 'Moderator', type: 'system', message: 'Topic open: Social Media connection vs loneliness.' },
          { speaker: 'Priya Patel (You)', type: 'user', message: 'Social platforms connect us quantitatively in follower counts, yet qualitative face-to-face empathy is often replaced by curated comparison.' }
        ]
      }
    ]
  }
];

const seed = db.transaction(() => {
  const salt = bcrypt.genSaltSync(10);
  const commonHash = bcrypt.hashSync('demo123', salt);

  for (const u of SEED_USERS) {
    let dbUser = db.prepare('SELECT * FROM users WHERE email = ?').get(u.email);

    if (!dbUser) {
      const res = db.prepare(`
        INSERT INTO users (name, email, password, bio, avatar, auth_provider)
        VALUES (?, ?, ?, ?, ?, 'local')
      `).run(u.name, u.email, commonHash, u.bio, u.avatar);
      dbUser = { user_id: res.lastInsertRowid, name: u.name, email: u.email };
      console.log(`👤 Created candidate user: ${u.name} (${u.email}) / demo123`);
    } else {
      db.prepare(`
        UPDATE users SET name = ?, password = ?, bio = ? WHERE user_id = ?
      `).run(u.name, commonHash, u.bio, dbUser.user_id);
      console.log(`👤 Updated existing candidate user: ${u.name} (${u.email})`);
    }

    // Clean old seed sessions for this user to keep data fresh and isolated
    db.prepare('DELETE FROM gd_sessions WHERE user_id = ?').run(dbUser.user_id);

    // Insert user's specific sessions
    for (const s of u.sessions) {
      const sessRes = db.prepare(`
        INSERT INTO gd_sessions (user_id, mode, topic, category, duration, status)
        VALUES (?, ?, ?, ?, ?, 'completed')
      `).run(dbUser.user_id, s.mode, s.topic, s.category, s.duration);

      const sessionId = sessRes.lastInsertRowid;

      // Insert transcripts
      const insertT = db.prepare(`
        INSERT INTO gd_transcripts (session_id, speaker, speaker_type, message, word_count)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const t of s.transcripts) {
        const words = t.message.split(/\s+/).length;
        insertT.run(sessionId, t.speaker, t.type, t.message, words);
      }

      // Insert performance
      const sc = s.scores;
      db.prepare(`
        INSERT INTO performance (
          session_id, user_id,
          communication_score, fluency_score, vocabulary_score, content_score,
          confidence_score, leadership_score, teamwork_score, critical_thinking,
          participation_score, relevance_score, listening_score, conclusion_score,
          overall_score, strengths, improvements, recommendations, full_feedback,
          filler_word_count, total_words, speaking_turns,
          speaking_time_seconds, meaningful_contributions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId, dbUser.user_id,
        sc.comm, sc.fluency, sc.vocab, sc.content,
        sc.conf, sc.lead, sc.team, sc.crit,
        sc.comm, sc.content, sc.team, sc.lead, // mapped to participation, relevance, listening, conclusion
        sc.overall,
        JSON.stringify(sc.strengths),
        JSON.stringify(sc.improvements),
        JSON.stringify(sc.recommendations),
        sc.full_feedback,
        sc.filler_words, sc.total_words, sc.turns,
        Math.round((sc.total_words / 130) * 60),
        sc.turns
      );
    }
  }

  console.log(`✅ Seeded ${SEED_USERS.length} distinct multi-user candidate profiles with fully isolated sessions and metrics!`);
});

seed();
db.close();
console.log('🎉 Database multi-user setup complete!');
