// audio.js — Procedural Web Audio API sound generator (Zero external audio files)

const Sound = (() => {
  let audioCtx = null;

  function init() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    // Chrome fix: preload speech voices (Chrome populates them async)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices(); // trigger first async load
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices(); // cache voices when ready
      };
    }
  }

  // ── Helper: White Noise Buffer ──
  let noiseBuffer = null;
  function getNoiseBuffer() {
    if (!audioCtx) return null;
    if (!noiseBuffer) {
      const bufferSize = audioCtx.sampleRate * 0.5; // 0.5 sec
      noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    }
    return noiseBuffer;
  }

  // ── Hit Sound (Punch/Kick) ──
  function playHit(type = "punch") {
    init();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    // Sub thud
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    const startFreq = type === "special" ? 220 : type === "kick" ? 160 : 130;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

    gain.gain.setValueAtTime(type === "special" ? 0.8 : 0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.2);

    // Noise snap
    const buffer = getNoiseBuffer();
    if (buffer) {
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(type === "special" ? 1800 : 1200, now);
      noiseFilter.Q.setValueAtTime(1.5, now);

      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      noise.start(now);
      noise.stop(now + 0.12);
    }
  }

  // ── Block Sound ──
  function playBlock() {
    init();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // ── Cinematic K.O. Explosion Sound ──
  function playKO() {
    init();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    // 1. Deep Sub-Drop Boom
    const sub = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(180, now);
    sub.frequency.exponentialRampToValueAtTime(20, now + 1.2);

    subGain.gain.setValueAtTime(1.0, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    sub.connect(subGain);
    subGain.connect(audioCtx.destination);
    sub.start(now);
    sub.stop(now + 1.5);

    // 2. Heavy Distortion Crash
    const buffer = getNoiseBuffer();
    if (buffer) {
      const crash = audioCtx.createBufferSource();
      crash.buffer = buffer;

      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2500, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 1.0);

      const crashGain = audioCtx.createGain();
      crashGain.gain.setValueAtTime(0.9, now);
      crashGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      crash.connect(filter);
      filter.connect(crashGain);
      crashGain.connect(audioCtx.destination);
      crash.start(now);
      crash.stop(now + 1.2);
    }

    // 3. Dramatic High Metallic Chime / Gong
    const gong = audioCtx.createOscillator();
    const gongGain = audioCtx.createGain();
    gong.type = "sine";
    gong.frequency.setValueAtTime(520, now);
    gong.frequency.exponentialRampToValueAtTime(320, now + 1.8);

    gongGain.gain.setValueAtTime(0.35, now + 0.05);
    gongGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    gong.connect(gongGain);
    gongGain.connect(audioCtx.destination);
    gong.start(now);
    gong.stop(now + 1.8);
  }

  // ── TTS Voice Lines System ──
  const startBanters = [
    { p1: "The rift is opening. Prepare yourself!", p2: "I was born in the rift. You stand no chance!" },
    { p1: "I hope you've trained hard. This ends quickly.", p2: "My asteroid rain will crush your little hope!" },
    { p1: "Let's see if you can survive my Kamehameha!", p2: "Show me what you've got, mortal!" },
    { p1: "Your reign of terror ends today!", p2: "Terror is just beginning. Ready to burn?" },
    { p1: "I can feel the energy flowing. You're wide open.", p2: "Open? I'm already behind you!" },
    { p1: "This arena will be your graveyard.", p2: "Bold words for someone about to turn to ash." },
    { p1: "No holds barred. Let's make this legendary!", p2: "Legendary? I call it a warm-up." },
    { p1: "Opponent, your calculations won't save you this time.", p2: "My calculations say you have zero percent chance." },
    { p1: "Face the power of the blue flame!", p2: "My red star will consume your weak flame." },
    { p1: "Ready or not, here I come!", p2: "I've been waiting for this. Don't disappoint me!" }
  ];

  const winMocks = [
    "You call that fighting? My grandma hits harder!",
    "Back to the lobby with you! Better luck next time.",
    "Did you forget how to block, or were you just admiring my form?",
    "Is that all the rift has to offer? What a waste of time.",
    "You thought you were a contender? Cute.",
    "Maybe you should try playing with your eyes open next time.",
    "You wanted a fight? Next time, bring a challenge!",
    "That was too easy. Are you sure you weren't throwing?",
    "Clean victory! You're simply out of my league.",
    "Stick to the tutorials, friend. You're not ready for this."
  ];

  let usedBanterIndices = [];
  let usedMockIndices = [];

  function buildUtterance(text, isBlue) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1;
    if (isBlue) {
      utterance.pitch = 1.15;
      utterance.rate = 1.05;
    } else {
      utterance.pitch = 0.8;
      utterance.rate = 0.9;
    }
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const engVoice = voices.find(v => v.lang.startsWith("en"));
      if (engVoice) utterance.voice = engVoice;
    }
    return utterance;
  }

  function speakText(text, isBlue, onDone) {
    if (!('speechSynthesis' in window)) { if (onDone) onDone(); return; }
    try {
      const utterance = buildUtterance(text, isBlue);
      // Prevent Chrome GC from killing utterance mid-speech
      window._currentUtterance = utterance;
      if (onDone) utterance.onend = onDone;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis failed", e);
      if (onDone) onDone();
    }
  }

  function playStartBanter(f1, f2, p1IsBlue, callback) {
    if (usedBanterIndices.length >= startBanters.length) {
      usedBanterIndices = [];
    }
    let idx;
    do {
      idx = Math.floor(Math.random() * startBanters.length);
    } while (usedBanterIndices.includes(idx));
    usedBanterIndices.push(idx);

    const dialogue = startBanters[idx];
    const p1Line = dialogue.p1.replace("Opponent", f2.name);
    const p2Line = dialogue.p2.replace("Opponent", f1.name);

    // Set P1 visual speech bubble immediately
    f1.speechText = p1Line;
    f1.speechTimer = 3000;

    // Cancel any stuck speech, then speak P1 line
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    // Speak P1 line; when done, speak P2 line
    speakText(p1Line, p1IsBlue, () => {
      // Small pause between fighters
      setTimeout(() => {
        f2.speechText = p2Line;
        f2.speechTimer = 3000;
        speakText(p2Line, !p1IsBlue, () => {
          if (callback) setTimeout(callback, 300);
        });
      }, 400);
    });

    // Fallback: if speech ends naturally before onend fires, use timeout
    if (!('speechSynthesis' in window) && callback) {
      setTimeout(callback, 1500);
    }
  }

  function playWinMock(winnerFighter, winnerIsBlue) {
    if (usedMockIndices.length >= winMocks.length) {
      usedMockIndices = [];
    }
    let idx;
    do {
      idx = Math.floor(Math.random() * winMocks.length);
    } while (usedMockIndices.includes(idx));
    usedMockIndices.push(idx);

    const mockText = winMocks[idx];

    // Set visual speech bubble on winning fighter
    winnerFighter.speechText = mockText;
    winnerFighter.speechTimer = 3000;

    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speakText(mockText, winnerIsBlue);
  }

  return {
    init,
    playHit,
    playBlock,
    playKO,
    playStartBanter,
    playWinMock,
  };
})();
