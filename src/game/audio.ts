// ============================================================
// Echoes of the Static - Audio System (Web Audio API)
// ============================================================

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private ambientNode: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private initialized = false;
  private heartRate = 60; // BPM

  async init() {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch {
      console.warn('Web Audio API not available');
    }
  }

  resume() {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Play echolocation pulse sound
  playPulse(loud: boolean = true) {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const duration = loud ? 1.2 : 0.4;
    const baseFreq = loud ? 80 : 200;
    const endFreq = loud ? 2000 : 800;

    // Main sweep
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration * 0.3);
    osc.frequency.exponentialRampToValueAtTime(60, now + duration);

    gain.gain.setValueAtTime(loud ? 0.4 : 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration);

    // Reverb-like echoes
    if (loud) {
      for (let i = 0; i < 4; i++) {
        const echoOsc = this.ctx.createOscillator();
        const echoGain = this.ctx.createGain();
        const delay = 0.15 + i * 0.12;
        const vol = 0.15 / (i + 1);

        echoOsc.type = 'sine';
        echoOsc.frequency.setValueAtTime(endFreq - i * 200, now + delay);
        echoOsc.frequency.exponentialRampToValueAtTime(40, now + delay + 0.5);

        echoGain.gain.setValueAtTime(0, now);
        echoGain.gain.setValueAtTime(vol, now + delay);
        echoGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.5);

        echoOsc.connect(echoGain);
        echoGain.connect(this.masterGain);
        echoOsc.start(now + delay);
        echoOsc.stop(now + delay + 0.5);
      }
    }

    // Noise burst for the "static" quality
    const bufferSize = this.ctx.sampleRate * duration;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(loud ? 0.12 : 0.04, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.5);

    // Bandpass filter for noise
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 0.5;

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + duration);
  }

  // Play footstep sound
  playFootstep(quiet: boolean = false) {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const duration = quiet ? 0.08 : 0.15;
    const vol = quiet ? 0.06 : 0.12;

    // Short noise burst
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = quiet ? 300 : 600;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    source.stop(now + duration);
  }

  // Play wall bump sound
  playBump() {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  // Set heartbeat rate based on danger
  setHeartRate(bpm: number) {
    this.heartRate = Math.max(40, Math.min(180, bpm));
  }

  startHeartbeat() {
    if (this.heartbeatInterval) return;

    const beat = () => {
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const interval = 60 / this.heartRate;

      // Low thump
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(40, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.15);

      const vol = Math.min(0.25, 0.08 + (this.heartRate - 60) * 0.002);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now);
      osc.stop(now + 0.25);

      // Second beat (double-beat of heart)
      if (this.heartRate > 80) {
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(35, now + 0.08);
        osc2.frequency.exponentialRampToValueAtTime(20, now + 0.2);

        const vol2 = vol * 0.6;
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.setValueAtTime(vol2, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc2.connect(gain2);
        gain2.connect(this.masterGain!);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.3);
      }
    };

    beat();
    this.heartbeatInterval = setInterval(beat, 60000 / this.heartRate);
  }

  updateHeartbeat(dangerLevel: number) {
    // dangerLevel 0-1
    const targetBPM = 60 + dangerLevel * 120;
    if (Math.abs(this.heartRate - targetBPM) > 5) {
      this.heartRate = targetBPM;
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
        this.startHeartbeat();
      }
    }
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Start ambient static
  startAmbient() {
    if (!this.ctx || !this.masterGain || this.ambientNode) return;

    const bufferSize = this.ctx.sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.015;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();

    this.ambientNode = { source, gain };
  }

  // Update ambient based on danger
  updateAmbient(dangerLevel: number) {
    if (this.ambientNode && this.ctx) {
      const freq = 200 + dangerLevel * 800;
      const vol = 0.015 + dangerLevel * 0.03;
      this.ambientNode.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
    }
  }

  stopAmbient() {
    if (this.ambientNode) {
      this.ambientNode.source.stop();
      this.ambientNode = null;
    }
  }

  // Entity detected sound - low growl
  playEntityGrowl(distance: number) {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const vol = Math.max(0.05, 0.3 / (distance + 1));

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(30 + Math.random() * 20, now);
    osc.frequency.linearRampToValueAtTime(25, now + 0.5);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 100;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  // Death sound
  playDeath() {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    // Harsh noise burst
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(50, now + 2);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    source.stop(now + 2);

    // Low drone
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 2);

    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 2);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 2);
  }

  // Win sound
  playWin() {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const notes = [440, 554, 659, 880];

    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const t = now + i * 0.2;

      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, t);
      gain.gain.setValueAtTime(0.2, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  stopAll() {
    this.stopHeartbeat();
    this.stopAmbient();
  }

  destroy() {
    this.stopAll();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.initialized = false;
    }
  }
}
