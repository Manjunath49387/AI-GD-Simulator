const express = require('express');
const { geminiChat, generateTopics, evaluatePerformance } = require('../utils/gemini');
const authMiddleware = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// AI Agent System Prompts — each has a unique personality
const AI_AGENTS = {
  arjun: {
    name: 'Arjun',
    role: 'Supporter',
    avatar: '🧑‍💼',
    color: '#4CAF50',
    systemPrompt: `You are Arjun, an enthusiastic and optimistic GD participant who SUPPORTS the discussion topic.
Your personality:
- Enthusiastic and positive, use statistics and facts to back your points
- You strongly support the topic with well-researched arguments
- You use phrases like "Absolutely!", "That's a great point!", "Studies show that..."
- You sometimes directly address other participants by name
- You speak clearly, in 2-4 sentences max per turn
- You NEVER repeat the same argument twice
- You build on previous points made in the discussion
- You ask the user thought-provoking questions occasionally
- Keep responses concise and GD-appropriate`
  },
  meera: {
    name: 'Meera',
    role: 'Opponent',
    avatar: '👩‍💼',
    color: '#F44336',
    systemPrompt: `You are Meera, a critical and sharp GD participant who OPPOSES or challenges arguments.
Your personality:
- Analytical, skeptical, and good at finding counterarguments
- You challenge weak reasoning with "But have you considered...", "That argument overlooks..."
- You play devil's advocate even when you partially agree
- You speak confidently, in 2-4 sentences max per turn
- You directly challenge the user's statements when they are weak
- You introduce new counterpoints and perspectives
- You sometimes reference real-world examples that contradict the dominant view
- Keep responses sharp and debate-worthy`
  },
  ravi: {
    name: 'Ravi',
    role: 'Analyst',
    avatar: '👨‍🔬',
    color: '#2196F3',
    systemPrompt: `You are Ravi, a logical and balanced GD participant who provides analytical perspectives.
Your personality:
- Calm, data-driven, and balanced in your approach
- You use phrases like "Looking at this from both angles...", "The data suggests...", "Let me analyze this..."
- You acknowledge valid points from both sides before giving your analysis
- You speak in a measured, academic tone in 2-4 sentences max per turn
- You often introduce new dimensions to the discussion
- You ask probing questions to deepen the analysis
- You summarize what has been discussed and add new insight
- Keep responses thoughtful and structured`
  },
  priya: {
    name: 'Priya',
    role: 'Moderator',
    avatar: '👩‍🏫',
    color: '#9C27B0',
    systemPrompt: `You are Priya, a confident moderator-type GD participant who facilitates the discussion.
Your personality:
- You control the flow, ensure everyone participates, and summarize key points
- You use phrases like "Let's hear from...", "To summarize so far...", "That's an interesting angle, but..."
- You challenge the user to speak up if they've been quiet: "We haven't heard your thoughts on this yet..."
- You speak in 2-3 sentences, clear and authoritative
- You sometimes call out when someone hasn't addressed the actual question
- You push for concrete examples and real-world application
- You create pressure for the user to take a stance
- Keep responses facilitating and energetic`
  }
};

// ─── POST /api/ai/respond ────────────────────────────────────────────────────
router.post('/respond', authMiddleware, async (req, res) => {
  const { agentId, topic, conversationHistory, userMessage, apiKey } = req.body;

  if (!agentId || !topic) {
    return res.status(400).json({ error: 'agentId and topic are required.' });
  }

  const agent = AI_AGENTS[agentId];
  if (!agent) {
    return res.status(400).json({ error: `Unknown agent: ${agentId}` });
  }

  // Build enhanced system prompt with topic context
  const systemPrompt = `${agent.systemPrompt}

CURRENT GD TOPIC: "${topic}"

IMPORTANT RULES:
1. Never say the same thing twice. Always add something NEW to the discussion.
2. Keep your response to 2-4 sentences maximum.
3. Be conversational and natural, not like a speech or essay.
4. Sometimes directly address "the student" or "you" to encourage them.
5. React to what was just said, don't ignore the conversation flow.`;

  // Build history for Gemini (last 10 messages to stay within limits)
  const history = (conversationHistory || []).slice(-10).map(msg => ({
    role: msg.speaker === 'You' ? 'user' : 'assistant',
    text: `[${msg.speaker}]: ${msg.message}`
  }));

  try {
    const responseText = await geminiChat(systemPrompt, history, userMessage || '[Please continue the GD discussion]', apiKey);

    res.json({
      agent: { id: agentId, name: agent.name, role: agent.role, avatar: agent.avatar, color: agent.color },
      message: responseText
    });
  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/ai/topics ─────────────────────────────────────────────────────
router.post('/topics', authMiddleware, async (req, res) => {
  const { category, apiKey } = req.body;

  if (!category) {
    return res.status(400).json({ error: 'Category is required.' });
  }

  try {
    const topics = await generateTopics(category, apiKey);
    res.json({ topics });
  } catch (err) {
    console.error('Topic generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/ai/evaluate ───────────────────────────────────────────────────
router.post('/evaluate', authMiddleware, async (req, res) => {
  const { sessionId, apiKey } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  // Get session data
  const session = db.prepare('SELECT * FROM gd_sessions WHERE session_id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  // Get user name
  const user = db.prepare('SELECT name FROM users WHERE user_id = ?').get(req.user.user_id);

  // Get full transcript
  const transcript = db.prepare(
    'SELECT * FROM gd_transcripts WHERE session_id = ? ORDER BY timestamp ASC'
  ).all(sessionId);

  if (transcript.length === 0) {
    return res.status(400).json({ error: 'No transcript found for this session.' });
  }

  // Check if user has any messages
  const userMessages = transcript.filter(t => t.speaker_type === 'user');
  if (userMessages.length === 0) {
    return res.status(400).json({ error: 'No user messages found in transcript.' });
  }

  try {
    const evaluation = await evaluatePerformance(transcript, user.name, session.topic, apiKey);

    // Count stats
    const totalWords = userMessages.reduce((sum, t) => sum + (t.word_count || 0), 0);
    const speakingTurns = userMessages.length;

    // Save performance to DB
    db.prepare(`
      INSERT OR REPLACE INTO performance 
      (session_id, user_id, communication_score, fluency_score, vocabulary_score, 
       content_score, confidence_score, leadership_score, teamwork_score, critical_thinking,
       overall_score, strengths, improvements, recommendations, full_feedback,
       total_words, speaking_turns)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      req.user.user_id,
      evaluation.communication_score,
      evaluation.fluency_score,
      evaluation.vocabulary_score,
      evaluation.content_score,
      evaluation.confidence_score,
      evaluation.leadership_score,
      evaluation.teamwork_score,
      evaluation.critical_thinking,
      evaluation.overall_score,
      JSON.stringify(evaluation.strengths || []),
      JSON.stringify(evaluation.improvements || []),
      JSON.stringify(evaluation.recommendations || []),
      evaluation.full_feedback || '',
      totalWords,
      speakingTurns
    );

    res.json({ evaluation, stats: { totalWords, speakingTurns } });
  } catch (err) {
    console.error('Evaluation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ai/agents ──────────────────────────────────────────────────────
router.get('/agents', authMiddleware, (req, res) => {
  const agents = Object.entries(AI_AGENTS).map(([id, agent]) => ({
    id, name: agent.name, role: agent.role, avatar: agent.avatar, color: agent.color
  }));
  res.json({ agents });
});

module.exports = router;
