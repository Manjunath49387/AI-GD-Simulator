/**
 * human-room.js — Human GD Room with Socket.IO
 */

const HumanRoom = (() => {
  let socket = null;
  let roomId = null;
  let topic = '';
  let userName = '';
  let userId = null;
  let sessionId = null;
  let timerInterval = null;
  let isHost = false;

  // ─── INITIALIZE ─────────────────────────────────────────
  async function init() {
    if (!AppUtils.requireAuth()) return;

    const user = AppUtils.getUser();
    userName = user?.name || 'Student';
    userId = user?.user_id;

    // Connect to Socket.IO
    socket = io(window.location.origin);
    setupSocketEvents();

    const params = new URLSearchParams(window.location.search);
    const action = params.get('action'); // 'create' or 'join'
    topic = decodeURIComponent(params.get('topic') || '');
    sessionId = params.get('session');

    if (action === 'create') {
      roomId = params.get('roomId');
      isHost = true;

      // Show room ID to share
      const roomIdEl = document.getElementById('room-id-display');
      if (roomIdEl) roomIdEl.textContent = roomId;

      socket.emit('room:create', { roomId, topic, userName, userId });
    } else if (params.get('roomId')) {
      roomId = params.get('roomId');
      const roomIdEl = document.getElementById('room-id-display');
      if (roomIdEl) roomIdEl.textContent = roomId;
      socket.emit('room:join', { roomId, userName, userId });
    } else {
      // Show join form
      showJoinForm();
    }

    // Set topic display
    document.getElementById('room-topic-text')?.setAttribute('data-topic', topic);
    setupUI();
  }

  function setupUI() {
    // Send message button
    document.getElementById('send-btn')?.addEventListener('click', sendMessage);

    // Chat input enter key
    document.getElementById('chat-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Start discussion (host only)
    document.getElementById('start-btn')?.addEventListener('click', startDiscussion);

    // End discussion
    document.getElementById('end-btn')?.addEventListener('click', endDiscussion);

    // Mute toggle
    document.getElementById('mute-btn')?.addEventListener('click', toggleMute);

    // Voice button
    document.getElementById('voice-btn')?.addEventListener('click', toggleVoiceInput);
  }

  function showJoinForm() {
    const joinModal = document.getElementById('join-modal');
    if (joinModal) joinModal.style.display = 'flex';

    document.getElementById('join-submit')?.addEventListener('click', () => {
      const inputRoomId = document.getElementById('room-id-input')?.value.trim().toUpperCase();
      if (!inputRoomId) {
        AppUtils.showToast('Please enter a Room ID', 'error');
        return;
      }
      roomId = inputRoomId;
      joinModal.style.display = 'none';
      socket.emit('room:join', { roomId, userName, userId });
    });
  }

  // ─── SOCKET EVENTS ──────────────────────────────────────
  function setupSocketEvents() {
    socket.on('connect', () => {
      console.log('🔌 Connected to server');
    });

    socket.on('room:joined', (data) => {
      roomId = data.roomId;
      topic = data.topic || topic;

      document.getElementById('room-topic-text').textContent = `"${topic}"`;
      document.getElementById('room-id-display').textContent = roomId;

      updateParticipantsList(data.participants);
      appendSystemMessage(`You joined the discussion room: ${roomId}`);

      if (isHost) {
        document.getElementById('host-controls')?.classList.remove('hidden');
      }
    });

    socket.on('room:error', (data) => {
      AppUtils.showToast(data.message, 'error');
      setTimeout(() => window.location.href = '/human-room.html', 2000);
    });

    socket.on('room:participant_joined', (data) => {
      updateParticipantsList(data.participants);
      appendSystemMessage(`${data.participant.name} joined the discussion`);
    });

    socket.on('room:participant_left', (data) => {
      updateParticipantsList(data.participants);
      appendSystemMessage(`${data.name} left the discussion`);
    });

    socket.on('room:participants_update', (participants) => {
      updateParticipantsList(participants);
    });

    socket.on('room:message', (data) => {
      appendChatMessage(data.userName, data.message, data.userName === userName);
    });

    socket.on('room:started', (data) => {
      appendSystemMessage('🚀 Discussion has started! Good luck everyone!');
      document.getElementById('start-btn')?.setAttribute('disabled', 'true');
      document.getElementById('status-badge').textContent = '🔴 LIVE';
    });

    socket.on('room:timer', (data) => {
      updateTimer(data.remaining);
    });

    socket.on('room:ended', (data) => {
      clearInterval(timerInterval);
      appendSystemMessage(`⏹️ ${data.message}`);
      AppUtils.showToast('Discussion ended! Redirecting...', 'info');

      // End session and redirect
      if (sessionId) {
        API.Sessions.end(sessionId).finally(() => {
          setTimeout(() => {
            window.location.href = `/results.html?session=${sessionId}&human=1`;
          }, 2000);
        });
      }
    });

    socket.on('disconnect', () => {
      AppUtils.showToast('Disconnected from server', 'error');
    });
  }

  // ─── MESSAGING ───────────────────────────────────────────
  function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input?.value.trim();
    if (!message || !socket) return;

    socket.emit('room:message', {
      roomId,
      userName,
      message,
      timestamp: new Date().toISOString()
    });

    // Save to backend transcript
    if (sessionId) {
      API.Sessions.addTranscript(sessionId, userName, 'user', message).catch(console.error);
    }

    input.value = '';
  }

  function appendChatMessage(speaker, message, isOwn) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const colors = ['#6c63ff', '#10b981', '#3b82f6', '#ec4899', '#f59e0b', '#ef4444', '#9c27b0', '#0ea5e9'];
    const colorIdx = Math.abs(speaker.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length;
    const color = colors[colorIdx];

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isOwn ? 'user' : ''}`;
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    bubble.innerHTML = `
      <div class="message-avatar" style="background: ${color}20; color: ${color}">
        ${speaker.charAt(0).toUpperCase()}
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-speaker" style="color: ${color}">${speaker}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${escapeHtml(message)}</div>
      </div>
    `;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  function appendSystemMessage(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'system-message';
    el.style.cssText = 'text-align:center; color: var(--text-muted); font-size:0.78rem; padding: 6px 12px; background: rgba(255,255,255,0.03); border-radius: 20px; margin: 4px auto; max-width: 400px;';
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  // ─── PARTICIPANTS ────────────────────────────────────────
  function updateParticipantsList(participants) {
    const list = document.getElementById('participants-list');
    if (!list) return;

    const countEl = document.getElementById('participant-count');
    if (countEl) countEl.textContent = participants.length;

    list.innerHTML = participants.map(p => {
      const isMe = p.name === userName;
      return `
        <div class="participant-card ${isMe ? 'user-card-room' : ''}">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="user-avatar" style="width:32px; height:32px; font-size:0.85rem;">
              ${p.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="font-size:0.85rem; font-weight:600; color: var(--text-primary)">
                ${p.name} ${isMe ? '<span style="color:var(--accent-green); font-size:0.7rem;">(You)</span>' : ''}
              </div>
              <div style="font-size:0.7rem; color: var(--text-muted)">
                ${p.isMuted ? '🔇 Muted' : '🟢 Active'}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ─── CONTROLS ────────────────────────────────────────────
  function startDiscussion() {
    const duration = parseInt(document.getElementById('duration-select')?.value || '600');
    socket.emit('room:start', { roomId, duration });
  }

  function endDiscussion() {
    if (!confirm('End the discussion for all participants?')) return;
    socket.emit('room:end', { roomId });
  }

  let isMuted = false;
  function toggleMute() {
    isMuted = !isMuted;
    socket.emit('room:toggle_mute', { roomId, isMuted });
    const btn = document.getElementById('mute-btn');
    if (btn) {
      btn.innerHTML = isMuted ? '🔇 Unmute' : '🎤 Mute';
      btn.className = isMuted ? 'btn btn-danger btn-sm' : 'btn btn-secondary btn-sm';
    }
    Speech.isMuted = isMuted;
  }

  function toggleVoiceInput() {
    const voiceBtn = document.getElementById('voice-btn');
    const chatInput = document.getElementById('chat-input');

    if (Speech.isListening()) {
      Speech.stopListening();
      if (voiceBtn) { voiceBtn.innerHTML = '🎤'; voiceBtn.classList.remove('recording'); }
      return;
    }

    Speech.startListening(
      (final, interim) => { if (chatInput) chatInput.value = final || interim; },
      (final, success) => {
        if (voiceBtn) { voiceBtn.innerHTML = '🎤'; voiceBtn.classList.remove('recording'); }
        if (final?.trim()) {
          chatInput.value = final;
          sendMessage();
        }
      }
    );

    if (voiceBtn) { voiceBtn.innerHTML = '⏹️'; voiceBtn.classList.add('recording'); }
  }

  // ─── TIMER ──────────────────────────────────────────────
  function updateTimer(remaining) {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    const str = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const el = document.getElementById('timer-display');
    if (el) {
      el.textContent = str;
      el.className = 'timer-display';
      if (remaining <= 60) el.classList.add('danger');
      else if (remaining <= 120) el.classList.add('warning');
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  return { init };
})();

window.HumanRoom = HumanRoom;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('human-room-page')) {
    HumanRoom.init();
  }
});
