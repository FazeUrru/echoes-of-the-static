// ============================================================
// Echoes of the Static - Audio System v2.5
// ============================================================

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private ambientNode: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private initialized = false;
  private heartRate = 60;

  async init() {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch { console.warn('Web Audio API not available'); }
  }

  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  setMasterVolume(v: number) { if (this.masterGain) this.masterGain.gain.value = v; }

  playPulse(loud: boolean = true) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const dur = loud ? 1.2 : 0.4;
    const baseF = loud ? 80 : 200, endF = loud ? 2000 : 800;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseF, now);
    osc.frequency.exponentialRampToValueAtTime(endF, now + dur * 0.3);
    osc.frequency.exponentialRampToValueAtTime(60, now + dur);
    gain.gain.setValueAtTime(loud ? 0.4 : 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(now); osc.stop(now + dur);

    if (loud) {
      for (let i = 0; i < 3; i++) {
        const eo = this.ctx.createOscillator(), eg = this.ctx.createGain();
        const delay = 0.15 + i * 0.12;
        eo.type = 'sine';
        eo.frequency.setValueAtTime(endF - i * 200, now + delay);
        eo.frequency.exponentialRampToValueAtTime(40, now + delay + 0.5);
        eg.gain.setValueAtTime(0, now);
        eg.gain.setValueAtTime(0.12 / (i + 1), now + delay);
        eg.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.5);
        eo.connect(eg); eg.connect(this.masterGain);
        eo.start(now + delay); eo.stop(now + delay + 0.5);
      }
    }

    // Noise burst
    const bs = Math.floor(this.ctx.sampleRate * dur);
    const nb = this.ctx.createBuffer(1, bs, this.ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < bs; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
    const ns = this.ctx.createBufferSource(); ns.buffer = nb;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(loud ? 0.1 : 0.03, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.5);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1000; f.Q.value = 0.5;
    ns.connect(f); f.connect(ng); ng.connect(this.masterGain);
    ns.start(now); ns.stop(now + dur);
  }

  playFootstep(quiet: boolean = false) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime, dur = quiet ? 0.08 : 0.15, vol = quiet ? 0.05 : 0.1;
    const bs = Math.floor(this.ctx.sampleRate * dur);
    const nb = this.ctx.createBuffer(1, bs, this.ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < bs; i++) d[i] = Math.random() * 2 - 1;
    const s = this.ctx.createBufferSource(); s.buffer = nb;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = quiet ? 300 : 600;
    s.connect(f); f.connect(g); g.connect(this.masterGain); s.start(now); s.stop(now + dur);
  }

  playBump() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(150, now); o.frequency.exponentialRampToValueAtTime(50, now + 0.15);
    g.gain.setValueAtTime(0.2, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    o.connect(g); g.connect(this.masterGain); o.start(now); o.stop(now + 0.2);
  }

  playDoorOpen() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(200, now); o.frequency.exponentialRampToValueAtTime(80, now + 0.3);
    g.gain.setValueAtTime(0.15, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    o.connect(f); f.connect(g); g.connect(this.masterGain); o.start(now); o.stop(now + 0.35);
  }

  playDoorLocked() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      const t = now + i * 0.08;
      o.type = 'square'; o.frequency.value = 300;
      g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g); g.connect(this.masterGain); o.start(t); o.stop(t + 0.06);
    }
  }

  playPickup() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(600, now); o.frequency.exponentialRampToValueAtTime(900, now + 0.1);
    g.gain.setValueAtTime(0.15, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    o.connect(g); g.connect(this.masterGain); o.start(now); o.stop(now + 0.2);
  }

  playUseItem() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(400, now); o.frequency.exponentialRampToValueAtTime(800, now + 0.15);
    g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    o.connect(g); g.connect(this.masterGain); o.start(now); o.stop(now + 0.25);
  }

  playFlashlightClick() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = 1200;
    g.gain.setValueAtTime(0.08, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    o.connect(g); g.connect(this.masterGain); o.start(now); o.stop(now + 0.04);
  }

  playThrow() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const bs = Math.floor(this.ctx.sampleRate * 0.2);
    const nb = this.ctx.createBuffer(1, bs, this.ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < bs; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bs);
    const s = this.ctx.createBufferSource(); s.buffer = nb;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.15, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    s.connect(g); g.connect(this.masterGain); s.start(now); s.stop(now + 0.25);
  }

  playEntityGrowl(distance: number, type: string = 'stalker') {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const vol = Math.max(0.03, 0.25 / (distance + 1));
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    const freq = type === 'phantom' ? 60 + Math.random() * 40 : type === 'hunter' ? 40 : 30 + Math.random() * 20;
    o.type = type === 'phantom' ? 'sine' : type === 'hunter' ? 'square' : 'sawtooth';
    o.frequency.setValueAtTime(freq, now); o.frequency.linearRampToValueAtTime(freq * 0.7, now + 0.5);
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = type === 'phantom' ? 200 : 100;
    o.connect(f); f.connect(g); g.connect(this.masterGain); o.start(now); o.stop(now + 0.6);
  }

  setHeartRate(bpm: number) { this.heartRate = Math.max(40, Math.min(180, bpm)); }

  startHeartbeat() {
    if (this.heartbeatInterval) return;
    const beat = () => {
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const vol = Math.min(0.25, 0.08 + (this.heartRate - 60) * 0.002);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(40, now); o.frequency.exponentialRampToValueAtTime(25, now + 0.15);
      g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      o.connect(g); g.connect(this.masterGain); o.start(now); o.stop(now + 0.25);
      if (this.heartRate > 80) {
        const o2 = this.ctx.createOscillator(), g2 = this.ctx.createGain();
        o2.type = 'sine'; o2.frequency.setValueAtTime(35, now + 0.08); o2.frequency.exponentialRampToValueAtTime(20, now + 0.2);
        g2.gain.setValueAtTime(0, now); g2.gain.setValueAtTime(vol * 0.6, now + 0.08);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        o2.connect(g2); g2.connect(this.masterGain); o2.start(now + 0.08); o2.stop(now + 0.3);
      }
    };
    beat();
    this.heartbeatInterval = setInterval(beat, 60000 / this.heartRate);
  }

  updateHeartbeat(dangerLevel: number) {
    const target = 60 + dangerLevel * 120;
    if (Math.abs(this.heartRate - target) > 5) {
      this.heartRate = target;
      if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; this.startHeartbeat(); }
    }
  }

  stopHeartbeat() { if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; } }

  startAmbient() {
    if (!this.ctx || !this.masterGain || this.ambientNode) return;
    const bs = this.ctx.sampleRate * 4;
    const nb = this.ctx.createBuffer(1, bs, this.ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < bs; i++) d[i] = Math.random() * 2 - 1;
    const s = this.ctx.createBufferSource(); s.buffer = nb; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0.015;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
    s.connect(f); f.connect(g); g.connect(this.masterGain); s.start();
    this.ambientNode = { source: s, gain: g };
  }

  updateAmbient(dangerLevel: number) {
    if (this.ambientNode && this.ctx) {
      this.ambientNode.gain.gain.setTargetAtTime(0.015 + dangerLevel * 0.03, this.ctx.currentTime, 0.1);
    }
  }

  stopAmbient() { if (this.ambientNode) { this.ambientNode.source.stop(); this.ambientNode = null; } }

  playDeath() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const bs = this.ctx.sampleRate * 2;
    const nb = this.ctx.createBuffer(1, bs, this.ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < bs; i++) d[i] = Math.random() * 2 - 1;
    const s = this.ctx.createBufferSource(); s.buffer = nb;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5, now); g.gain.exponentialRampToValueAtTime(0.001, now + 2);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2000, now); f.frequency.exponentialRampToValueAtTime(50, now + 2);
    s.connect(f); f.connect(g); g.connect(this.masterGain); s.start(now); s.stop(now + 2);
    const o = this.ctx.createOscillator(), og = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(60, now); o.frequency.exponentialRampToValueAtTime(20, now + 2);
    og.gain.setValueAtTime(0.3, now); og.gain.exponentialRampToValueAtTime(0.001, now + 2);
    o.connect(og); og.connect(this.masterGain); o.start(now); o.stop(now + 2);
  }

  playWin() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    [440, 554, 659, 880].forEach((freq, i) => {
      const o = this.ctx!.createOscillator(), g = this.ctx!.createGain();
      const t = now + i * 0.2;
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.setValueAtTime(0.2, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g); g.connect(this.masterGain!); o.start(t); o.stop(t + 0.6);
    });
  }

  stopAll() { this.stopHeartbeat(); this.stopAmbient(); }

  destroy() {
    this.stopAll();
    if (this.ctx) { this.ctx.close(); this.ctx = null; this.initialized = false; }
  }
}
