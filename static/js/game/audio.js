// SKRT DERBY - Audio Engine (Web Audio API - oscillator-based synth)
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.initialized = false;
    this.engineNodes = {};
    this.musicOscillators = [];
    this.musicGain = null;
    this.musicPlaying = false;
  }

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API not available:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // --- Sound Effects ---

  _playTone(freq, duration, type = 'square', vol = 0.3, rampDown = true) {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    if (rampDown) {
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    }
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + duration);
  }

  crash(intensity = 1) {
    if (!this.initialized) return;
    // Noise burst for crash
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.05));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4 * intensity, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000 * intensity, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.3);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start();
    noise.stop(this.ctx.currentTime + 0.3);

    // Impact thud
    this._playTone(80, 0.2, 'sine', 0.4 * intensity);
  }

  explosion() {
    if (!this.initialized) return;
    // Big noise burst
    const bufferSize = this.ctx.sampleRate * 0.8;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.12));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.8);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start();
    noise.stop(this.ctx.currentTime + 0.8);

    this._playTone(40, 0.5, 'sine', 0.5);
  }

  empBlast() {
    if (!this.initialized) return;
    // Electric crackle
    const now = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200 + Math.random() * 2000, now + i * 0.04);
      gain.gain.setValueAtTime(0.15, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.08);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.08);
    }
    this._playTone(60, 0.3, 'sine', 0.3);
  }

  shockwaveSound() {
    if (!this.initialized) return;
    // Deep boom
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.6);

    // Rumble noise
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.06));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.3, this.ctx.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
    noise.connect(ng);
    ng.connect(this.masterGain);
    noise.start();
    noise.stop(this.ctx.currentTime + 0.4);
  }

  powerUp() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    [440, 554, 659, 880].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.15, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.2);
    });
  }

  hit() {
    if (!this.initialized) return;
    this._playTone(150, 0.15, 'square', 0.2);
    this._playTone(100, 0.1, 'sine', 0.15);
  }

  countdown() {
    if (!this.initialized) return;
    this._playTone(880, 0.12, 'square', 0.2, false);
  }

  countdownGo() {
    if (!this.initialized) return;
    this._playTone(1320, 0.3, 'square', 0.3, false);
  }

  gameOverWin() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.15);
      gain.gain.setValueAtTime(0.2, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.4);
    });
  }

  gameOverLose() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    [400, 300, 200, 100].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.2);
      gain.gain.setValueAtTime(0.2, now + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.3);
    });
  }

  // --- Continuous Engine Sound ---

  startEngine(carId) {
    if (!this.initialized) return;
    if (this.engineNodes[carId]) return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc1.frequency.value = 60 + Math.random() * 10;
    osc2.type = 'square';
    osc2.frequency.value = 120 + Math.random() * 20;

    filter.type = 'lowpass';
    filter.frequency.value = 300;

    gain.gain.value = 0.04;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start();
    osc2.start();

    this.engineNodes[carId] = { osc1, osc2, gain, filter };
  }

  updateEngine(carId, speed, health) {
    if (!this.initialized) return;
    const nodes = this.engineNodes[carId];
    if (!nodes) return;

    const absSpeed = Math.abs(speed);
    const rpm = 0.5 + absSpeed * 1.5;
    nodes.osc1.frequency.value = 50 + rpm * 60;
    nodes.osc2.frequency.value = 100 + rpm * 100;
    nodes.filter.frequency.value = 200 + rpm * 600;
    nodes.gain.gain.value = Math.max(0.01, 0.05 * rpm * (health / 100));
  }

  stopEngine(carId) {
    if (!this.initialized) return;
    const nodes = this.engineNodes[carId];
    if (!nodes) return;

    nodes.gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    setTimeout(() => {
      try {
        nodes.osc1.stop();
        nodes.osc2.stop();
      } catch (e) {}
    }, 350);

    delete this.engineNodes[carId];
  }

  // --- Background Music ---

  startMusic() {
    if (!this.initialized || this.musicPlaying) return;
    this.musicPlaying = true;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.06;
    this.musicGain.connect(this.masterGain);

    // Simple bassline loop
    const bassPattern = [55, 55, 65, 55, 73, 65, 55, 49];
    let step = 0;

    const playBassStep = () => {
      if (!this.musicPlaying) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = bassPattern[step % bassPattern.length];
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.2);

      step++;
      this._musicTimeout = setTimeout(playBassStep, 180);
    };

    // Hi-hat pattern
    const playHihat = () => {
      if (!this.musicPlaying) return;
      const bufferSize = this.ctx.sampleRate * 0.05;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.01));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 8000;
      noise.connect(hp);
      hp.connect(gain);
      gain.connect(this.musicGain);
      noise.start();
      noise.stop(this.ctx.currentTime + 0.05);
      this._hihatTimeout = setTimeout(playHihat, 90);
    };

    playBassStep();
    playHihat();
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this._musicTimeout) clearTimeout(this._musicTimeout);
    if (this._hihatTimeout) clearTimeout(this._hihatTimeout);
    if (this.musicGain) {
      this.musicGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    }
  }

  setMasterVolume(v) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, v));
    }
  }
}

export default AudioEngine;
