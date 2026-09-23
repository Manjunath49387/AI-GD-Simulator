/**
 * ai-room.js — AI Group Discussion Room Controller
 * Orchestrates: user turns, AI responses, speech, transcript saving
 */

const AIRoom = (() => {
  // ─── STATE ──────────────────────────────────────────────
  let sessionId = null;
  let topic = '';
  let userName = '';
  let conversationHistory = [];
  let timerInterval = null;
  let timerRemaining = 10 * 60; // 10 minutes default
  let gdDuration = 10 * 60;
  let isUserTurn = false;
  let isProcessing = false;
  let fillerWordCount = 0;
  let wordCount = 0;
  let speakingTurns = 0;

  // AI agents in rotation order
  const AGENTS = ['arjun', 'meera', 'ravi', 'priya'];
  const AGENT_INFO = {
    arjun: { name: 'Arjun', role: 'Supporter', avatar: '🧑‍💼', color: '#10b981' },
    meera: { name: 'Meera', role: 'Opponent', avatar: '👩‍💼', color: '#ef4444' },
    ravi:  { name: 'Ravi',  role: 'Analyst',  avatar: '👨‍🔬', color: '#3b82f6' },
    priya: { name: 'Priya', role: 'Moderator', avatar: '👩‍🏫', color: '#9c27b0' }
  };

  let currentAgentIdx = 0;

  // ─── INITIALIZE ─────────────────────────────────────────
  async function init() {
    if (!AppUtils.requireAuth()) return;

    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('session');
    topic = decodeURIComponent(params.get('topic') || '');
    gdDuration = parseInt(params.get('duration') || '600');
    timerRemaining = gdDuration;
    userName = AppUtils.getUser()?.name || 'You';

    if (!sessionId || !topic) {
      window.location.href = '/select-topic.html';
      return;
    }

    // Render room UI elements
    document.getElementById('room-topic-text').textContent = `"${topic}"`;
    document.getElementById('user-name-label').textContent = userName;
    updateTimer();

    // Show prep overlay
    showPrepOverlay();
  }

  // ─── PREP COUNTDOWN ─────────────────────────────────────
  function showPrepOverlay() {
    const overlay = document.getElementById('prep-overlay');
    const countdown = document.getElementById('prep-countdown');
    const prepTopic = document.getElementById('prep-topic');

    if (prepTopic) prepTopic.textContent = `"${topic}"`;

    let seconds = 30;
    countdown.textContent = seconds;
    overlay.style.display = 'flex';

    const interval = setInterval(() => {
      seconds--;
      countdown.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(interval);
        overlay.style.display = 'none';
        startDiscussion();
      }
    }, 1000);

    // Allow skipping prep
    document.getElementById('skip-prep-btn')?.addEventListener('click', () => {
      clearInterval(interval);
      overlay.style.display = 'none';
      startDiscussion();
    });
  }

  // ─── START GD ────────────────────────────────────────────
  async function startDiscussion() {
    startTimer();

    // Opening message from Priya (moderator) using simple, warm language
    await triggerAgentResponse('priya', `Welcome everyone! Let's begin our group discussion on the topic: "${topic}". Please feel free to share your thoughts, and anyone can speak up. Let us start!`);
  }

  // ─── TIMER ──────────────────────────────────────────────
  function startTimer() {
    updateTimer();
    timerInterval = setInterval(() => {
      timerRemaining--;
      updateTimer();
      if (timerRemaining <= 0) {
        clearInterval(timerInterval);
        endDiscussion('time');
      }
    }, 1000);
  }

  function updateTimer() {
    const m = Math.floor(timerRemaining / 60);
    const s = timerRemaining % 60;
    const str = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const el = document.getElementById('timer-display');
    if (el) {
      el.textContent = str;
      el.className = 'timer-display';
      if (timerRemaining <= 60) el.classList.add('danger');
      else if (timerRemaining <= 120) el.classList.add('warning');
    }
  }

  // ─── AI RESPONSE ─────────────────────────────────────────
  async function triggerAgentResponse(agentId, forcedMessage = null) {
    if (isProcessing) return;
    isProcessing = true;

    const agent = AGENT_INFO[agentId];
    setParticipantSpeaking(agentId, true);
    setTurnIndicator(`${agent.name} is speaking...`);
    showTypingIndicator(agentId);

    let responseText = forcedMessage;

    if (!responseText) {
      try {
        const context = conversationHistory.slice(-8);
        const data = await API.AI.getAgentResponse(
          agentId,
          topic,
          context,
          conversationHistory.length > 0
            ? `[Continue the GD discussion. Previous speaker: ${conversationHistory[conversationHistory.length - 1]?.speaker}]`
            : `[Start the GD discussion on "${topic}"]`
        );
        responseText = data.message;
      } catch (err) {
        console.error('AI response error:', err);
        AppUtils.showToast('Failed to get AI response. Check your API key.', 'error');
        isProcessing = false;
        setParticipantSpeaking(agentId, false);
        enableUserTurn();
        return;
      }
    }

    hideTypingIndicator();

    // Add to conversation history
    const entry = { speaker: agent.name, speaker_type: 'ai', message: responseText, timestamp: new Date().toISOString() };
    conversationHistory.push({ speaker: agent.name, message: responseText });

    // Save to backend
    API.Sessions.addTranscript(sessionId, agent.name, 'ai', responseText).catch(console.error);

    // Render message
    appendMessage(agent, responseText, false);

    // Speak the response
    Speech.speak(responseText, agentId, () => {
      setParticipantSpeaking(agentId, false);
      isProcessing = false;

      // After AI speaks, if still time, enable user or pick next agent
      if (timerRemaining > 0) {
        if (shouldUserSpeak()) {
          enableUserTurn();
        } else {
          setTimeout(() => {
            const nextAgent = pickNextAgent(agentId);
            triggerAgentResponse(nextAgent);
          }, 1500);
        }
      }
    });

    updateLiveStats();
  }

  function pickNextAgent(lastAgentId) {
    const idx = AGENTS.indexOf(lastAgentId);
    return AGENTS[(idx + 1) % AGENTS.length];
  }

  function shouldUserSpeak() {
    // Give user a turn every 2 AI turns, or randomly
    const userMessages = conversationHistory.filter(m => m.speaker === 'You').length;
    const totalMessages = conversationHistory.length;
    if (totalMessages === 0) return false;
    if (userMessages === 0 && totalMessages >= 3) return true; // Force first turn
    return Math.random() < 0.45; // ~45% chance
  }

  // ─── USER TURN ───────────────────────────────────────────
  function enableUserTurn() {
    if (timerRemaining <= 0) return;
    isUserTurn = true;
    setTurnIndicator('Your turn to speak!');

    const inputArea = document.getElementById('input-area');
    if (inputArea) inputArea.classList.add('active-turn');

    const voiceBtn = document.getElementById('voice-btn');
    if (voiceBtn) voiceBtn.style.animation = 'pulse 2s infinite';
  }

  function disableUserTurn() {
    isUserTurn = false;
    const inputArea = document.getElementById('input-area');
    if (inputArea) inputArea.classList.remove('active-turn');
    const voiceBtn = document.getElementById('voice-btn');
    if (voiceBtn) voiceBtn.style.animation = '';
  }

  async function submitUserMessage(text) {
    if (!text || !text.trim() || isProcessing) return;

    const message = text.trim();
    Speech.stopSpeaking(); // Stop AI if still talking
    disableUserTurn();

    // Detect filler words
    const fillers = Speech.detectFillerWords(message);
    fillerWordCount += fillers.reduce((s, f) => s + f.count, 0);
    wordCount += message.split(/\s+/).filter(Boolean).length;
    speakingTurns++;

    // Add to history
    conversationHistory.push({ speaker: 'You', message });

    // Save to backend
    API.Sessions.addTranscript(sessionId, userName, 'user', message).catch(console.error);

    // Render user message
    appendMessage({ name: 'You', avatar: '🧑‍🎓', color: '#10b981' }, message, true);

    // Show filler warning if any
    if (fillers.length > 0) {
      const fillerNames = fillers.map(f => `"${f.word}"`).join(', ');
      AppUtils.showToast(`Tip: Avoid filler words: ${fillerNames}`, 'info', 4000);
    }

    updateLiveStats();

    // Trigger AI response
    if (timerRemaining > 0) {
      setTimeout(() => {
        const respondingAgent = pickRespondingAgent(message);
        triggerAgentResponse(respondingAgent);
      }, 800);
    }
  }

  function pickRespondingAgent(userMessage) {
    // Meera responds to positive statements, Arjun to negative ones
    const lower = userMessage.toLowerCase();
    if (lower.includes('not') || lower.includes('against') || lower.includes('problem') || lower.includes('issue')) {
      return 'arjun';
    }
    if (lower.includes('agree') || lower.includes('yes') || lower.includes('good')) {
      return 'meera';
    }
    if (lower.includes('?') || lower.includes('think') || lower.includes('what')) {
      return 'ravi';
    }
    return AGENTS[Math.floor(Math.random() * AGENTS.length)];
  }

  // ─── DOM HELPERS ─────────────────────────────────────────
  function appendMessage(agent, message, isUser) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isUser ? 'user' : ''}`;

    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    bubble.innerHTML = `
      <div class="message-avatar" style="background: ${agent.color || '#6c63ff'}20; color: ${agent.color || '#a78bfa'}">
        ${agent.avatar || '🤖'}
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-speaker" style="color: ${agent.color || '#a78bfa'}">${agent.name}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${escapeHtml(message)}</div>
      </div>
    `;

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  function showTypingIndicator(agentId) {
    hideTypingIndicator();
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const agent = AGENT_INFO[agentId];
    const indicator = document.createElement('div');
    indicator.id = 'typing-indicator';
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `
      <div class="message-avatar" style="background: ${agent.color}20; color: ${agent.color}">
        ${agent.avatar}
      </div>
      <div class="typing-dots">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;
    container.appendChild(indicator);
    container.scrollTop = container.scrollHeight;
  }

  function hideTypingIndicator() {
    document.getElementById('typing-indicator')?.remove();
  }

  function setParticipantSpeaking(agentId, speaking) {
    document.querySelectorAll('.participant-card').forEach(c => c.classList.remove('speaking'));
    if (speaking) {
      const card = document.getElementById(`agent-${agentId}`);
      if (card) card.classList.add('speaking');
    }

    document.querySelectorAll('.speaking-indicator').forEach(el => {
      el.classList.add('hidden');
    });
    if (speaking) {
      const indicator = document.querySelector(`#agent-${agentId} .speaking-indicator`);
      if (indicator) indicator.classList.remove('hidden');
    }
  }

  function setTurnIndicator(text) {
    const el = document.getElementById('turn-text');
    if (el) el.textContent = text;
  }

  function updateLiveStats() {
    const turnEl = document.getElementById('stat-turns');
    const wordEl = document.getElementById('stat-words');
    const fillerEl = document.getElementById('stat-fillers');
    if (turnEl) turnEl.textContent = speakingTurns;
    if (wordEl) wordEl.textContent = wordCount;
    if (fillerEl) fillerEl.textContent = fillerWordCount;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  // ─── END DISCUSSION ──────────────────────────────────────
  async function endDiscussion(reason = 'manual') {
    clearInterval(timerInterval);
    Speech.stopSpeaking();
    Speech.stopListening();

    if (reason === 'time') {
      AppUtils.showToast('Discussion time is up!', 'info');
    }

    // End session in backend
    try {
      await API.Sessions.end(sessionId);
    } catch (err) {
      console.error('Error ending session:', err);
    }

    // Redirect to results with evaluation
    AppUtils.showToast('Analyzing your performance...', 'info', 3000);

    setTimeout(async () => {
      try {
        await API.AI.evaluate(sessionId);
        window.location.href = `/results.html?session=${sessionId}`;
      } catch (err) {
        AppUtils.showToast('Evaluation failed. Redirecting anyway...', 'error');
        setTimeout(() => {
          window.location.href = `/results.html?session=${sessionId}`;
        }, 2000);
      }
    }, 1500);
  }

  // ─── PUBLIC API ──────────────────────────────────────────
  return {
    init,
    submitUserMessage,
    startListening() {
      // Interrupt AI if currently speaking
      Speech.stopSpeaking();
      enableUserTurn();

      const voiceBtn = document.getElementById('voice-btn');
      const chatInput = document.getElementById('chat-input');
      const inputStatus = document.getElementById('input-status');

      if (Speech.isListening()) {
        Speech.stopListening();
        if (voiceBtn) { voiceBtn.innerHTML = '🎤'; voiceBtn.classList.remove('recording'); }
        if (inputStatus) inputStatus.textContent = '';
        return;
      }

      if (inputStatus) inputStatus.textContent = '🔴 Listening... speak now';

      const started = Speech.startListening(
        (final, interim) => {
          if (chatInput) chatInput.value = final || interim;
        },
        (final, success) => {
          if (voiceBtn) { voiceBtn.innerHTML = '🎤'; voiceBtn.classList.remove('recording'); }
          if (inputStatus) inputStatus.textContent = '';
          if (final && final.trim()) {
            submitUserMessage(final);
            if (chatInput) chatInput.value = '';
          }
        }
      );

      if (started && voiceBtn) {
        voiceBtn.innerHTML = '⏹️';
        voiceBtn.classList.add('recording');
      } else if (!started) {
        AppUtils.showToast('Microphone not available. Please type your response.', 'info');
      }
    },
    endDiscussion
  };
})();

window.AIRoom = AIRoom;

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('ai-room-page')) {
    AIRoom.init();
  }
});
