/**
 * speech.js — Web Speech API wrapper for STT + TTS
 * Works in Chrome/Edge (partial support in Firefox)
 */

const Speech = (() => {
  // ─── STATE ──────────────────────────────────────────────
  let recognition = null;
  let synthesis = window.speechSynthesis;
  let isListening = false;
  let isSpeaking = false;
  let onResultCallback = null;
  let onEndCallback = null;

  // Voice preferences per agent
  const VOICE_PREFS = {
    arjun: { lang: 'en-IN', pitch: 1.1, rate: 0.95, preferMale: true },
    meera: { lang: 'en-IN', pitch: 1.3, rate: 1.0, preferMale: false },
    ravi: { lang: 'en-IN', pitch: 0.95, rate: 0.88, preferMale: true },
    priya: { lang: 'en-IN', pitch: 1.2, rate: 1.05, preferMale: false },
    default: { lang: 'en-US', pitch: 1.0, rate: 1.0, preferMale: false }
  };

  // ─── SPEECH RECOGNITION (STT) ───────────────────────────
  function isSTTSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  function startListening(onResult, onEnd, continuous = false) {
    if (!isSTTSupported()) {
      console.warn('Speech recognition not supported in this browser');
      if (onEnd) onEnd('', false, 'not_supported');
      return false;
    }

    if (isListening) stopListening();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    recognition.lang = 'en-IN';
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    onResultCallback = onResult;
    onEndCallback = onEnd;

    let finalTranscript = '';
    let interimTranscript = '';

    recognition.onstart = () => {
      isListening = true;
      console.log('🎤 Listening...');
    };

    recognition.onresult = (event) => {
      interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      if (onResultCallback) {
        onResultCallback(finalTranscript, interimTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      isListening = false;
      if (onEndCallback) onEndCallback(finalTranscript, false, event.error);
    };

    recognition.onend = () => {
      isListening = false;
      if (onEndCallback) onEndCallback(finalTranscript, true, null);
      finalTranscript = '';
    };

    try {
      recognition.start();
      return true;
    } catch (err) {
      console.error('Failed to start recognition:', err);
      return false;
    }
  }

  function stopListening() {
    if (recognition && isListening) {
      recognition.stop();
      isListening = false;
    }
  }

  // ─── TEXT TO SPEECH (TTS) ────────────────────────────────
  function isTTSSupported() {
    return 'speechSynthesis' in window;
  }

  function getVoice(prefs) {
    const voices = synthesis.getVoices();
    if (!voices.length) return null;

    // Try to find an Indian English voice
    let preferred = voices.find(v =>
      v.lang.includes('en-IN') && (prefs.preferMale ? v.name.match(/male|man|raj|arjun|ravi/i) : v.name.match(/female|woman|meera|priya/i))
    );

    if (!preferred) {
      preferred = voices.find(v => v.lang.includes('en-IN'));
    }

    if (!preferred) {
      preferred = voices.find(v =>
        v.lang.includes('en') && (prefs.preferMale ? v.name.match(/male|man|david|mark/i) : v.name.match(/female|woman|samantha|zira|hazel/i))
      );
    }

    if (!preferred) {
      preferred = voices.find(v => v.lang.includes('en'));
    }

    return preferred || null;
  }

  function speak(text, agentId = 'default', onDone = null) {
    if (!isTTSSupported() || !text) {
      if (onDone) onDone();
      return;
    }

    // Cancel any ongoing speech
    synthesis.cancel();

    const prefs = VOICE_PREFS[agentId] || VOICE_PREFS.default;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = prefs.lang;
    utterance.pitch = prefs.pitch;
    utterance.rate = prefs.rate;
    utterance.volume = 1;

    // Set voice
    const voice = getVoice(prefs);
    if (voice) utterance.voice = voice;

    utterance.onstart = () => { isSpeaking = true; };
    utterance.onend = () => {
      isSpeaking = false;
      if (onDone) onDone();
    };
    utterance.onerror = () => {
      isSpeaking = false;
      if (onDone) onDone();
    };

    isSpeaking = true;
    synthesis.speak(utterance);
  }

  function stopSpeaking() {
    if (synthesis) {
      synthesis.cancel();
      isSpeaking = false;
    }
  }

  // Load voices (Chrome loads them async)
  if (isTTSSupported()) {
    synthesis.getVoices();
    synthesis.onvoiceschanged = () => { synthesis.getVoices(); };
  }

  // ─── FILLER WORD DETECTION ───────────────────────────────
  const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'right', 'okay so', 'i mean', 'kind of', 'sort of'];

  function detectFillerWords(text) {
    const lower = text.toLowerCase();
    const found = [];
    for (const filler of FILLER_WORDS) {
      const regex = new RegExp(`\\b${filler}\\b`, 'gi');
      const matches = lower.match(regex);
      if (matches) {
        found.push({ word: filler, count: matches.length });
      }
    }
    return found;
  }

  return {
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    isListening: () => isListening,
    isSpeaking: () => isSpeaking,
    isSTTSupported,
    isTTSSupported,
    detectFillerWords
  };
})();

window.Speech = Speech;
