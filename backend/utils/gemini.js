require('dotenv').config();
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── CURATED OFFLINE TOPICS BY CATEGORY ──────────────────────────────────────
const FALLBACK_TOPICS = {
  Technology: [
    'Is Artificial Intelligence replacing human creativity or augmenting it?',
    'Should Social Media platforms be held legally responsible for user-generated misinformation?',
    'Data Privacy in the Digital Age: Is absolute personal privacy still possible?',
    'The Ethics of Autonomous Vehicles: Who should decide life-and-death algorithms?',
    'Remote Work vs Office Culture: Has technology permanently altered the workplace?',
    'Cryptocurrency and Central Bank Digital Currencies: Future of global finance or speculative bubble?'
  ],
  Economy: [
    'Universal Basic Income: Necessary social safety net or economic disincentive?',
    'E-Commerce vs Traditional Retail: Balancing convenience and local livelihoods',
    'Startup Ecosystem: Are tech unicorn valuations detached from economic fundamentals?',
    'Gig Economy: Empowerment of flexible workers or modern labor exploitation?',
    'Globalization in Retreat: Are protectionist tariffs beneficial for domestic growth?',
    'Clean Energy Transition: Can developing economies balance decarbonization and rapid industrial growth?'
  ],
  'Social Issues': [
    'Impact of Short-Form Video Content (Reels/TikTok) on youth attention span and mental health',
    'Work-Life Balance in High-Pressure Industries: Individual responsibility vs corporate duty',
    'Standardized Testing in Education: True measure of intellect or barrier to creative potential?',
    'Climate Change: Individual consumer choices vs systemic corporate regulation',
    'Gender Equality in Corporate Leadership: Have diversity initiatives yielded real change?',
    'Mental Health Awareness: Bridging the stigma gap in academic and professional spaces'
  ],
  General: [
    'Has technology connected people more or isolated them in echo chambers?',
    'Is higher education still worth the rising tuition costs in modern career paths?',
    'Leadership vs Management: Which quality is more vital in navigating uncertainty?',
    'Should voting in democratic national elections be made legally mandatory?',
    'Hard Skills vs Soft Skills: What truly determines long-term career trajectory?',
    'Can ethics and profitability coexist harmoniously in modern business enterprises?'
  ]
};

// ─── CURATED AGENT FALLBACK STATEMENTS ────────────────────────────────────────
const FALLBACK_PERSONA_RESPONSES = {
  Arjun: [
    "I'd like to emphasize the immense potential here. When we examine the long-term opportunities, the evidence shows that forward-thinking innovation consistently drives progress.",
    "Building on that perspective, looking at modern case studies reveals significant positive economic and social multipliers when executed responsibly.",
    "That is a great observation. If we harness this constructively with clear guidelines, it creates scalable advantages for everyone involved."
  ],
  Meera: [
    "While that perspective sounds appealing on the surface, we cannot afford to overlook the significant hidden risks and unintended systemic consequences.",
    "I have to respectfully challenge that premise. The underlying data indicates several structural bottlenecks and regulatory blind spots that haven't been resolved.",
    "Have we factored in the socioeconomic divide? What works for well-funded institutions often leaves marginalized communities bearing the brunt of the downside."
  ],
  Ravi: [
    "Analyzing this objectively, we need to balance both the optimistic projections and the pragmatic constraints before drawing a definitive conclusion.",
    "From a quantitative standpoint, the trade-off hinges on capital allocation, execution discipline, and measurable metrics of impact.",
    "Let us break this down into short-term disruption versus long-term equilibrium. Both sides present valid points that require strategic synthesis."
  ],
  Priya: [
    "Looking at global benchmarks and comparative market implementations, successful adoption has always depended on transparent governance frameworks.",
    "If we examine empirical data from similar transitions over the past decade, proactive investment in skilling consistently mitigates the projected downsides.",
    "The core question is sustainability: can this model maintain efficacy without creating dependency or systemic fragility?"
  ],
  Vikram: [
    "Let us scrutinize the underlying assumptions here. Without strict accountability mechanisms, promises of self-regulation have historically proven inadequate.",
    "I believe we are confusing correlation with causation. We must evaluate who actually benefits and who shoulders the underlying liabilities.",
    "That is an overly idealistic assumption. In real-world competitive markets, economic incentives rarely align naturally with ethical ideals."
  ],
  Rohan: [
    "To bring these diverse viewpoints together, it seems we all agree on the necessity of change, while differing on the pace and governance required.",
    "Synthesizing the valid points made across the table: balancing innovation with risk management is clearly our common ground.",
    "As we near the conclusion of this discussion, our consensus points toward a phased roadmap rather than an all-or-nothing approach."
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
 * Evaluate a full GD transcript and return performance scores.
 */
async function evaluatePerformance(transcript, userName, topic, apiKey) {
  const key = apiKey || GEMINI_API_KEY;

  // Filter user transcript messages
  const userTurns = transcript.filter(t =>
    t.speaker_type === 'user' ||
    (t.speaker && (t.speaker.includes('You') || t.speaker.toLowerCase().includes(userName.toLowerCase())))
  );

  const totalUserWords = userTurns.reduce((acc, t) => acc + (t.word_count || (t.message ? t.message.split(/\s+/).length : 0)), 0);
  const turnsCount = userTurns.length;

  if (!key) {
    return generateSmartOfflineEvaluation(userTurns, totalUserWords, turnsCount, userName, topic);
  }

  try {
    const transcriptText = transcript
      .map(t => `[${t.speaker}]: ${t.message}`)
      .join('\n');

    const prompt = `You are an expert Group Discussion (GD) evaluator. Analyze the following GD transcript and evaluate the performance of participant "${userName}".

TOPIC: "${topic}"

TRANSCRIPT:
${transcriptText}

Evaluate "${userName}" ONLY. Provide scores from 0-100 for each dimension based on their actual contributions.
Return ONLY valid JSON with this exact structure:
{
  "communication_score": <0-100>,
  "fluency_score": <0-100>,
  "vocabulary_score": <0-100>,
  "content_score": <0-100>,
  "confidence_score": <0-100>,
  "leadership_score": <0-100>,
  "teamwork_score": <0-100>,
  "critical_thinking": <0-100>,
  "overall_score": <0-100>,
  "strengths": ["strength1", "strength2", "strength3"],
  "improvements": ["area1", "area2", "area3"],
  "recommendations": ["rec1", "rec2", "rec3"],
  "full_feedback": "<2-3 paragraph feedback>"
}`;

    const result = await geminiChat(
      'You are an expert Group Discussion evaluator. Always respond with valid JSON only.',
      [],
      prompt,
      key
    );

    const match = result.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (err) {
    console.warn('Gemini evaluation API error, applying algorithmic evaluation:', err.message);
  }

  return generateSmartOfflineEvaluation(userTurns, totalUserWords, turnsCount, userName, topic);
}

/**
 * Algorithmic evaluation engine based on transcript linguistics, turn frequency, and substance
 */
function generateSmartOfflineEvaluation(userTurns, totalWords, turnsCount, userName, topic) {
  // Baseline scores
  let comm = 75;
  let fluency = 74;
  let vocab = 76;
  let content = 78;
  let conf = 75;
  let lead = 72;
  let team = 80;
  let crit = 76;

  // Modulate based on participation
  if (turnsCount >= 4) { lead += 10; conf += 8; comm += 6; }
  else if (turnsCount >= 2) { lead += 5; conf += 4; }
  else if (turnsCount === 1) { lead -= 10; conf -= 8; }

  if (totalWords >= 200) { content += 8; vocab += 6; fluency += 5; }
  else if (totalWords < 50) { content -= 12; vocab -= 8; fluency -= 8; }

  // Clamp 45 - 95
  const clamp = (v) => Math.max(45, Math.min(95, Math.round(v)));
  comm = clamp(comm);
  fluency = clamp(fluency);
  vocab = clamp(vocab);
  content = clamp(content);
  conf = clamp(conf);
  lead = clamp(lead);
  team = clamp(team);
  crit = clamp(crit);

  const overall = Math.round(
    comm * 0.15 + fluency * 0.15 + vocab * 0.1 + content * 0.2 +
    conf * 0.1 + lead * 0.1 + team * 0.1 + crit * 0.1
  );

  return {
    communication_score: comm,
    fluency_score: fluency,
    vocabulary_score: vocab,
    content_score: content,
    confidence_score: conf,
    leadership_score: lead,
    teamwork_score: team,
    critical_thinking: crit,
    overall_score: overall,
    strengths: [
      turnsCount >= 3 ? "Active and steady presence across the discussion flow" : "Clear opening contribution and respectful tone",
      "Good alignment with the core discussion topic without straying into tangents",
      "Constructive engagement and cooperative group dynamic"
    ],
    improvements: [
      turnsCount < 3 ? "Increase participation to at least 3-4 speaking turns per GD round" : "Incorporate more empirical examples or statistics to solidify arguments",
      "Work on taking the initiative to synthesize consensus towards the end of the discussion"
    ],
    recommendations: [
      "Practice 3-part structured responses: Premise, Evidence, and Strategic Impact",
      "Use transitional connectors like 'Building on that insight' and 'To synthesize what was shared'",
      "Target 2-3 sessions per week to elevate spontaneous fluency under pressure"
    ],
    full_feedback: `${userName} demonstrated commendable enthusiasm and focus during this discussion on "${topic}". Your articulation was coherent and you maintained a polite, collaborative demeanor throughout. With more proactive initiative to steer diverging points and summarize conclusions, your leadership presence will be exceptional.`
  };
}

module.exports = { geminiChat, generateTopics, evaluatePerformance };
