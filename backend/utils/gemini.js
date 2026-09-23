require('dotenv').config();
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── CURATED OFFLINE TOPICS BY CATEGORY ──────────────────────────────────────
const FALLBACK_TOPICS = {
  Technology: [
    'Is Artificial Intelligence helping human creativity or replacing jobs?',
    'Should Social Media platforms be held responsible for fake news and misinformation?',
    'Data Privacy in the Digital Age: Is personal privacy still possible online?',
    'Self-Driving Cars: Are automated vehicles safe and ready for Indian roads?',
    'Work From Home vs Office: Which is better for productivity and career growth?',
    'Digital Currency and Crypto: The future of money or a risky gamble?'
  ],
  Economy: [
    'Universal Basic Income: A helpful safety net or a discouragement to work?',
    'Online Shopping vs Local Stores: Does online shopping hurt small shopkeepers?',
    'Startups in India: Are company valuations realistic or overhyped?',
    'Gig Economy and Delivery Apps: Freedom of work or lack of job security?',
    'Local Manufacturing vs Global Trade: Should countries prioritize making everything locally?',
    'Solar and Green Energy: Can countries grow fast while cutting pollution?'
  ],
  'Social Issues': [
    'Impact of Short Videos (Reels and Shorts) on student focus and mental health',
    'Work-Life Balance: Are long working hours necessary to succeed?',
    'Exams and Marks: Do test scores reflect real intelligence or block creativity?',
    'Climate Change: What is more effective — individual habits or government rules?',
    'Gender Equality: Are modern workplaces truly giving equal opportunities?',
    'Mental Health: How can schools and colleges talk more openly about stress?'
  ],
  General: [
    'Has social media made people more connected or more lonely?',
    'Is a college degree still necessary to build a successful career?',
    'Leadership vs Management: Which is more important during difficult times?',
    'Voting: Should voting in national elections be made compulsory?',
    'Hard Skills vs Communication Skills: What matters more for getting hired?',
    'Ethics vs Profit: Can modern businesses be honest and still make high profits?'
  ]
};

// ─── CURATED AGENT FALLBACK STATEMENTS (SIMPLE VOCABULARY) ──────────────────
const FALLBACK_PERSONA_RESPONSES = {
  Arjun: [
    "I agree with this topic. In our everyday lives, we can see real benefits and new opportunities opening up for students and young people.",
    "That is a really good point. If we use this properly and follow good habits, it helps everyone do their work faster and better.",
    "I want to add that when people try new things with an open mind, it brings positive changes for our society."
  ],
  Meera: [
    "I understand your point, but we also need to think about the problems. Not everyone has equal access, and it can create unfair situations.",
    "I see it a bit differently. If we are not careful, there are real risks like misuse, privacy issues, and lack of proper rules.",
    "That sounds nice in theory, but in real life, many people struggle to adapt. We must address these practical difficulties first."
  ],
  Ravi: [
    "Let us look at both sides simply. There is a clear advantage on one hand, but also a cost and challenge on the other hand.",
    "To understand this easily, think about the practical impact: who gains the most, and what problems do we need to fix first?",
    "A good solution is to take the best parts of both ideas. We can move forward step-by-step instead of rushing into it."
  ],
  Priya: [
    "That is an interesting view! Let us hear what others think about this. What has been your personal experience?",
    "To put it simply, we are seeing good points on both sides. Let us now talk about what action we should take next.",
    "Thank you for sharing that point. Would anyone like to add another example from daily life?"
  ],
  Vikram: [
    "We need to be realistic here. Without clear rules and honest checks, good intentions alone are not enough to solve the problem.",
    "Let us keep it simple: who is responsible if things go wrong? We need clear accountability before moving forward.",
    "That might work in ideal conditions, but in everyday reality, people often face very different practical issues."
  ],
  Rohan: [
    "To summarize where we stand so far: we all agree that change is happening, but we need to manage it step-by-step.",
    "Both sides have raised valid everyday points. Finding a middle ground will give us the most practical solution.",
    "As we wrap up this point, our main takeaway is that balance and clear guidelines are key."
  ]
};

/**
 * Send a prompt to the Gemini API and return the text response.
 */
async function geminiChat(systemPrompt, history = [], userMessage, apiKey) {
  const key = apiKey || GEMINI_API_KEY;

  if (!key) {
    // Return intelligent simulated response based on persona if detected in systemPrompt
    for (const [name, responses] of Object.entries(FALLBACK_PERSONA_RESPONSES)) {
      if (systemPrompt.includes(name)) {
        const idx = Math.floor(Math.random() * responses.length);
        return responses[idx];
      }
    }
    return "That brings up an essential dimension of the topic. Considering both practical constraints and long-term impact will help us form a balanced perspective.";
  }

  try {
    const contents = [];
    for (const msg of history) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents,
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 512,
        topP: 0.9,
        topK: 40
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' }
      ]
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`Gemini API returned ${response.status}: ${err}. Falling back to dynamic offline response.`);
      for (const [name, responses] of Object.entries(FALLBACK_PERSONA_RESPONSES)) {
        if (systemPrompt.includes(name)) {
          return responses[Math.floor(Math.random() * responses.length)];
        }
      }
      return "That brings up an essential dimension. Considering both practical constraints and long-term impact helps us form a balanced view.";
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : "I agree with that point and would like to build further on it.";
  } catch (networkErr) {
    console.warn('Network error reaching Gemini, using offline fallback:', networkErr.message);
    for (const [name, responses] of Object.entries(FALLBACK_PERSONA_RESPONSES)) {
      if (systemPrompt.includes(name)) {
        return responses[Math.floor(Math.random() * responses.length)];
      }
    }
    return "Valid point. Moving forward, how should we structure the implementation?";
  }
}

/**
 * Generate a list of GD topics for a given category.
 */
async function generateTopics(category, apiKey) {
  const key = apiKey || GEMINI_API_KEY;

  if (!key) {
    const list = FALLBACK_TOPICS[category] || FALLBACK_TOPICS.General;
    // Shuffle and return 6
    return [...list].sort(() => 0.5 - Math.random()).slice(0, 6);
  }

  try {
    const prompt = `Generate exactly 6 thought-provoking Group Discussion topics for the category: "${category}".
Return ONLY a valid JSON array of strings, like:
["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5", "Topic 6"]`;

    const result = await geminiChat('You are a GD topic expert.', [], prompt, key);
    const match = result.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (err) {
    console.warn('Gemini topic generation fallback:', err.message);
  }

  return FALLBACK_TOPICS[category] || FALLBACK_TOPICS.General;
}

/**
 * Evaluate a full GD transcript and return a 10-metric performance evaluation.
 * Uses the expert evaluator prompt with exact weighted scoring.
 */
async function evaluatePerformance(transcript, userName, topic, apiKey) {
  const key = apiKey || GEMINI_API_KEY;

  // ── Derive basic stats from transcript ──────────────────────────────────────
  const userTurns = transcript.filter(t =>
    t.speaker_type === 'user' ||
    (t.speaker && (t.speaker.includes('You') || t.speaker.toLowerCase().includes(userName.toLowerCase())))
  );
  const totalUserWords = userTurns.reduce(
    (acc, t) => acc + (t.word_count || (t.message ? t.message.split(/\s+/).length : 0)), 0
  );
  const turnsCount = userTurns.length;

  if (!key) {
    return generateSmartOfflineEvaluation(userTurns, totalUserWords, turnsCount, userName, topic);
  }

  try {
    const transcriptText = transcript
      .map(t => `[${t.speaker}]: ${t.message}`)
      .join('\n');

    const evaluatorSystemPrompt = `You are an expert AI Group Discussion evaluator for a placement-preparation platform.
Evaluate each participant's performance using objective, measurable, and explainable metrics.
You MUST respond ONLY with valid JSON matching the exact schema provided. No markdown, no prose outside JSON.`;

    const evaluatorPrompt = `Evaluate the performance of participant "${userName}" in the following Group Discussion.

TOPIC: "${topic}"

TRANSCRIPT:
${transcriptText}

EVALUATION RUBRIC — Score each category 0–10 (stored as 0–100 in output):

1. content_quality (weight 15%): Relevance of ideas, accuracy, depth, examples
2. communication (weight 15%): Clarity, fluency, vocabulary, sentence formation
3. participation (weight 10%): Number of meaningful contributions, speaking balance, avoids silence/over-speaking
4. relevance (weight 10%): Stays on topic, avoids repetition and tangents
5. listening_response (weight 10%): Responds to others, builds on ideas, shows understanding before disagreeing
6. teamwork (weight 10%): Encourages others, cooperates, maintains positive environment
7. leadership (weight 10%): Initiates discussion, guides conversation, connects viewpoints, helps reach conclusion
8. critical_thinking (weight 10%): Logical arguments, identifies problems/solutions, compares viewpoints, gives reasoning
9. confidence_professionalism (weight 5%): Confident communication, respectful language, handles disagreement calmly
10. conclusion (weight 5%): Summarizes key points, connects opinions, provides clear conclusion

Overall Score = (content_quality*15 + communication*15 + participation*10 + relevance*10 + listening_response*10 + teamwork*10 + leadership*10 + critical_thinking*10 + confidence_professionalism*5 + conclusion*5) / 100

FAIRNESS RULES:
- Evaluate ONLY "${userName}", not others
- Never reward speaking quantity over quality
- Do not penalize for accent, gender, or background
- Base all feedback on actual transcript content

Return ONLY this JSON (all scores 0–100, no markdown):
{
  "participant": "${userName}",
  "overall_score": <weighted 0-100>,
  "metrics": {
    "content_quality": <0-100>,
    "communication": <0-100>,
    "participation": <0-100>,
    "relevance": <0-100>,
    "listening_response": <0-100>,
    "teamwork": <0-100>,
    "leadership": <0-100>,
    "critical_thinking": <0-100>,
    "confidence_professionalism": <0-100>,
    "conclusion": <0-100>
  },
  "behavioral_metrics": {
    "speaking_time_seconds": <estimated from word count at 130 WPM>,
    "speaking_turns": <count of their turns>,
    "meaningful_contributions": <turns with substantive new points>,
    "interruptions": <count of interruptions>,
    "repeated_points": <count of repeated ideas>,
    "responses_to_others": <count of direct responses to other speakers>,
    "questions_asked": <count of questions>,
    "topic_deviations": <count of off-topic remarks>
  },
  "strengths": ["<specific strength 1 with example>", "<specific strength 2>", "<specific strength 3>"],
  "weaknesses": ["<specific weakness 1 with example>", "<specific weakness 2>", "<specific weakness 3>"],
  "evidence": [
    "<direct quote or paraphrase from their speech with score rationale>",
    "<another evidence point>",
    "<another evidence point>"
  ],
  "improvement_suggestions": {
    "communication": "<actionable, specific suggestion>",
    "content": "<actionable, specific suggestion>",
    "teamwork": "<actionable, specific suggestion>"
  },
  "practice_plan": [
    "<step 1 — specific practice activity>",
    "<step 2>",
    "<step 3>",
    "<step 4>",
    "<step 5>"
  ],
  "full_feedback": "<2–3 paragraph evidence-based narrative feedback>",
  "placement_readiness": "<one-sentence placement readiness verdict with score interpretation: Excellent/Very Good/Good/Needs Improvement/Requires Significant Practice>"
}`;

    const result = await geminiChat(evaluatorSystemPrompt, [], evaluatorPrompt, key);

    // Strip any markdown fences if the model added them
    const cleaned = result.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return normalizeEvaluation(parsed, turnsCount, totalUserWords);
    }
  } catch (err) {
    console.warn('Gemini evaluation API error, applying algorithmic evaluation:', err.message);
  }

  return generateSmartOfflineEvaluation(userTurns, totalUserWords, turnsCount, userName, topic);
}

/**
 * Normalize API response to ensure all required fields are present
 * and map nested metrics back to flat DB fields.
 */
function normalizeEvaluation(parsed, turnsCount, totalWords) {
  const m = parsed.metrics || {};
  const bm = parsed.behavioral_metrics || {};
  const impSug = parsed.improvement_suggestions || {};

  return {
    // ── 10 metric scores ───────────────────────────────────────
    content_score:          Number(m.content_quality          || m.content_score || 70),
    communication_score:    Number(m.communication            || 70),
    participation_score:    Number(m.participation            || 70),
    relevance_score:        Number(m.relevance                || 70),
    listening_score:        Number(m.listening_response       || 70),
    teamwork_score:         Number(m.teamwork                 || 70),
    leadership_score:       Number(m.leadership               || 70),
    critical_thinking:      Number(m.critical_thinking        || 70),
    confidence_score:       Number(m.confidence_professionalism || m.confidence_score || 70),
    conclusion_score:       Number(m.conclusion               || 70),
    // Legacy aliases (kept for backward compat with results.html)
    fluency_score:          Number(m.communication            || 70),
    vocabulary_score:       Number(m.content_quality          || 70),
    // ── Overall ────────────────────────────────────────────────
    overall_score: Number(parsed.overall_score || computeWeightedScore(m)),
    // ── Behavioral metrics ─────────────────────────────────────
    speaking_time_seconds:    Number(bm.speaking_time_seconds    || Math.round((totalWords / 130) * 60)),
    speaking_turns:           Number(bm.speaking_turns           || turnsCount),
    meaningful_contributions: Number(bm.meaningful_contributions || Math.max(1, turnsCount - 1)),
    interruptions:            Number(bm.interruptions            || 0),
    repeated_points:          Number(bm.repeated_points         || 0),
    responses_to_others:      Number(bm.responses_to_others     || 0),
    questions_asked:          Number(bm.questions_asked         || 0),
    topic_deviations:         Number(bm.topic_deviations        || 0),
    total_words:              totalWords,
    // ── Feedback arrays ────────────────────────────────────────
    strengths:    Array.isArray(parsed.strengths)  ? parsed.strengths  : [],
    improvements: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
    recommendations: Array.isArray(parsed.practice_plan) ? parsed.practice_plan : [],
    evidence:    Array.isArray(parsed.evidence)    ? parsed.evidence   : [],
    practice_plan: Array.isArray(parsed.practice_plan) ? parsed.practice_plan : [],
    improvement_suggestions: [
      impSug.communication || '',
      impSug.content       || '',
      impSug.teamwork      || ''
    ].filter(Boolean),
    full_feedback:       parsed.full_feedback       || '',
    placement_readiness: parsed.placement_readiness || '',
  };
}

/**
 * Compute weighted overall score from 10 metrics.
 */
function computeWeightedScore(m) {
  return Math.round(
    (Number(m.content_quality          || 0) * 0.15) +
    (Number(m.communication            || 0) * 0.15) +
    (Number(m.participation            || 0) * 0.10) +
    (Number(m.relevance                || 0) * 0.10) +
    (Number(m.listening_response       || 0) * 0.10) +
    (Number(m.teamwork                 || 0) * 0.10) +
    (Number(m.leadership               || 0) * 0.10) +
    (Number(m.critical_thinking        || 0) * 0.10) +
    (Number(m.confidence_professionalism || 0) * 0.05) +
    (Number(m.conclusion               || 0) * 0.05)
  );
}

/**
 * Algorithmic 10-metric evaluation engine (offline fallback).
 * Mirrors exact same output schema as the Gemini path.
 */
function generateSmartOfflineEvaluation(userTurns, totalWords, turnsCount, userName, topic) {
  // ── Base scores per metric ─────────────────────────────────
  let contentQ  = 72; // Content Quality
  let comm      = 74; // Communication
  let partic    = 68; // Participation
  let relev     = 75; // Relevance
  let listening = 70; // Listening & Response
  let teamwork  = 72; // Teamwork
  let leadership= 68; // Leadership
  let critThink = 73; // Critical Thinking
  let confProf  = 75; // Confidence & Professionalism
  let conclusion= 65; // Conclusion

  // ── Adjust for participation depth ─────────────────────────
  if (turnsCount >= 5) {
    partic += 18; leadership += 12; comm += 8; confProf += 6;
  } else if (turnsCount >= 3) {
    partic += 10; leadership += 6; comm += 4;
  } else if (turnsCount === 2) {
    partic += 3;
  } else if (turnsCount <= 1) {
    partic -= 18; leadership -= 14; confProf -= 8; conclusion -= 10;
  }

  // ── Adjust for content volume ──────────────────────────────
  if (totalWords >= 250) {
    contentQ += 10; critThink += 8; comm += 6; relev += 5;
  } else if (totalWords >= 120) {
    contentQ += 5; critThink += 4;
  } else if (totalWords < 60) {
    contentQ -= 14; critThink -= 10; comm -= 8; relev -= 6;
  }

  // ── Check for questions in transcript ─────────────────────
  const questionsAsked = userTurns.filter(t => t.message && t.message.includes('?')).length;
  if (questionsAsked >= 2) { listening += 8; teamwork += 6; }
  else if (questionsAsked === 1) { listening += 3; teamwork += 3; }

  // ── Response indicators ────────────────────────────────────
  const responseKeywords = /\b(agree|disagree|build|add|point|mentioned|said|think|respond|reply)\b/i;
  const responsesToOthers = userTurns.filter(t => t.message && responseKeywords.test(t.message)).length;
  if (responsesToOthers >= 3) { listening += 8; teamwork += 6; }
  else if (responsesToOthers >= 1) { listening += 3; teamwork += 3; }

  // ── Summary/conclusion indicators ─────────────────────────
  const summaryKeywords = /\b(conclude|summary|summarize|overall|final|wrap|end)\b/i;
  const hasSummary = userTurns.some(t => t.message && summaryKeywords.test(t.message));
  if (hasSummary) { conclusion += 15; leadership += 8; }

  // ── Clamp all scores to 48–94 ─────────────────────────────
  const clamp = v => Math.max(48, Math.min(94, Math.round(v)));
  contentQ   = clamp(contentQ);
  comm       = clamp(comm);
  partic     = clamp(partic);
  relev      = clamp(relev);
  listening  = clamp(listening);
  teamwork   = clamp(teamwork);
  leadership = clamp(leadership);
  critThink  = clamp(critThink);
  confProf   = clamp(confProf);
  conclusion = clamp(conclusion);

  // ── Weighted overall ───────────────────────────────────────
  const overall = Math.round(
    contentQ * 0.15 + comm * 0.15 + partic * 0.10 + relev * 0.10 +
    listening * 0.10 + teamwork * 0.10 + leadership * 0.10 + critThink * 0.10 +
    confProf * 0.05 + conclusion * 0.05
  );

  // ── Behavioral estimates ───────────────────────────────────
  const estTime   = Math.round((totalWords / 130) * 60);
  const meanContr = Math.max(1, turnsCount - (turnsCount > 3 ? 1 : 0));

  // ── Strengths / weaknesses based on scores ─────────────────
  const strengths = [];
  const weaknesses = [];

  if (partic >= 75)    strengths.push(`Active participation across ${turnsCount} turns — contributed consistently without dominating`);
  else                 weaknesses.push(`Limited participation (${turnsCount} turn${turnsCount !== 1 ? 's' : ''}) — aim for at least 4–5 meaningful turns per session`);

  if (contentQ >= 75)  strengths.push('Content quality was strong — points were relevant and showed topic awareness');
  else                 weaknesses.push('Strengthen content depth — support each point with a specific example or statistic');

  if (listening >= 75) strengths.push('Good responsiveness to other speakers — showed active listening and built on contributions');
  else                 weaknesses.push('Improve active listening — directly acknowledge and respond to at least 2–3 other participants per session');

  if (conclusion >= 70) strengths.push('Contributed to summarizing the discussion — showed ability to connect multiple viewpoints');
  else                  weaknesses.push('Work on conclusion skills — practice summarizing 3 key points in 2 clear sentences at discussion end');

  if (leadership >= 75) strengths.push('Demonstrated leadership — helped guide the conversation and connect different perspectives');

  // Pick top 3 of each
  const top3S = strengths.slice(0, 3);
  const top3W = weaknesses.slice(0, 3);
  while (top3S.length < 3) top3S.push('Maintained respectful and professional tone throughout the discussion');
  while (top3W.length < 3) top3W.push('Practice structuring each point as: Claim → Evidence → Impact for maximum clarity');

  const placementScore =
    overall >= 90 ? 'Excellent — ready for top-tier placement GDs' :
    overall >= 80 ? 'Very Good — strong candidate with minor refinements needed' :
    overall >= 70 ? 'Good — solid foundation, needs consistent practice on weak areas' :
    overall >= 60 ? 'Needs Improvement — targeted practice on content depth and participation required' :
                    'Requires Significant Practice — focus on participation, content quality, and active listening';

  return {
    // 10 metric scores
    content_score:          contentQ,
    communication_score:    comm,
    participation_score:    partic,
    relevance_score:        relev,
    listening_score:        listening,
    teamwork_score:         teamwork,
    leadership_score:       leadership,
    critical_thinking:      critThink,
    confidence_score:       confProf,
    conclusion_score:       conclusion,
    // Legacy aliases
    fluency_score:          comm,
    vocabulary_score:       contentQ,
    overall_score:          overall,
    // Behavioral metrics
    speaking_time_seconds:    estTime,
    speaking_turns:           turnsCount,
    meaningful_contributions: meanContr,
    interruptions:            0,
    repeated_points:          Math.max(0, turnsCount - meanContr),
    responses_to_others:      responsesToOthers,
    questions_asked:          questionsAsked,
    topic_deviations:         0,
    total_words:              totalWords,
    // Feedback
    strengths: top3S,
    improvements: top3W,
    recommendations: [
      'Practice the 3-part structure for each point: Claim → Evidence → Impact.',
      'Aim for 4–5 speaking turns per session — quality over quantity.',
      `Use transition phrases like "Building on that..." or "To add to ${userName}'s point..." to show active listening.`,
      'Practice 60-second summaries at the end of each GD to strengthen conclusion skills.',
      'Record yourself in mock GDs weekly and review for filler words and topic deviations.',
    ],
    evidence: [
      totalWords > 0
        ? `${userName} spoke approximately ${totalWords} words across ${turnsCount} turn${turnsCount !== 1 ? 's' : ''}, suggesting ${totalWords >= 150 ? 'good' : 'limited'} engagement.`
        : `No transcript data available for evidence-based scoring — scores reflect structural defaults.`,
      questionsAsked > 0
        ? `Asked ${questionsAsked} question${questionsAsked > 1 ? 's' : ''} during the discussion, indicating interactive participation.`
        : 'Did not ask questions during the session — asking 1–2 clarifying questions significantly improves listening scores.',
      hasSummary
        ? 'Used concluding language, demonstrating awareness of discussion structure and leadership.'
        : 'Did not contribute a conclusion — ending with a brief summary boosts both Leadership and Conclusion scores.',
    ],
    improvement_suggestions: [
      'Communication: Present each idea in 2–3 concise sentences. Avoid run-on explanations — clarity scores higher than length.',
      'Content: Research 2–3 data points (statistics, real-world examples) before each GD to strengthen content depth.',
      'Teamwork: Explicitly acknowledge another participant\'s point before building on it ("I agree with what was said about X, and I\'d add...").',
    ],
    practice_plan: [
      'Week 1: Practice speaking on any topic for 60 seconds — record and count filler words (um, uh, like). Target: under 5 per minute.',
      'Week 2: Do 3 mock GDs focused on active listening — summarize the previous speaker\'s point before adding your own.',
      'Week 3: Practice conclusion writing — after each GD, write a 3-sentence summary connecting all viewpoints raised.',
      'Week 4: Focus on leadership — initiate discussion in at least 2 GDs and guide the group toward a consensus.',
      'Ongoing: Join 2–3 online GD practice groups weekly. Review recordings for topic adherence and response quality.',
    ],
    full_feedback: `${userName} participated in this Group Discussion on "${topic}" with ${turnsCount > 3 ? 'commendable frequency' : turnsCount > 1 ? 'moderate engagement' : 'limited engagement'}. ${totalWords >= 150 ? 'The volume of contribution was adequate, though depth and structured argumentation can be strengthened further.' : 'The contribution volume was below optimal — increasing speaking turns while maintaining quality is the priority.'}

Key areas of strength include ${top3S[0].toLowerCase()}. The discussion also showed ${listening >= 70 ? 'reasonable awareness of other participants\' contributions' : 'room for improvement in active listening and responsiveness to peers'}.

To advance to placement-readiness, focus on: (1) structuring each point with a clear claim, supporting evidence, and strategic impact; (2) contributing a meaningful summary near the end of each session; and (3) directly acknowledging and building on at least 2 other participants\' points per discussion.`,
    placement_readiness: placementScore,
  };
}

module.exports = { geminiChat, generateTopics, evaluatePerformance };

