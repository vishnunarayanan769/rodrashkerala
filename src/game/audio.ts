import { ENGINE_PROFILES } from './settings';
import type { EngineSound, EngineProfile } from './settings';

type Wave = OscillatorType;

const SCALE = [0, 1, 4, 5, 7, 8, 11, 12, 13, 16, 17, 19]; // Mayamalavagowla-ish
const BASE = 73.42; // D2
const BPM = 140;

const BASS_PATTERN = [
  // bar of 16 steps -> scale degree or -1
  [0, -1, -1, 0, -1, -1, 0, -1, 0, -1, -1, 0, -1, 0, -1, -1],
  [0, -1, -1, 0, -1, -1, 0, -1, 0, -1, -1, 0, -1, 1, -1, 0],
  [3, -1, -1, 3, -1, -1, 3, -1, 2, -1, -1, 2, -1, 1, -1, -1],
  [4, -1, -1, 4, -1, -1, 3, -1, 2, -1, -1, 1, -1, 1, 0, -1],
];
const LEAD_PATTERN = [
  [7, -1, 9, 7, -1, 6, 7, -1, 9, -1, 10, 9, -1, 7, -1, -1],
  [7, -1, 9, 10, -1, 9, 7, -1, 6, -1, 4, 6, -1, 7, -1, -1],
  [10, -1, 11, 10, -1, 9, 7, -1, 9, -1, 10, 9, -1, 6, -1, 7],
  [9, -1, 7, 6, -1, 4, 6, -1, 7, -1, 9, 7, -1, 6, 4, -1],
];

export class AudioEngine {
  ctx: AudioContext | null = null;
  muted = false;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise: AudioBuffer | null = null;
  private eOsc1: OscillatorNode | null = null;
  private eOsc2: OscillatorNode | null = null;
  private eGain: GainNode | null = null;
  private eFilter: BiquadFilterNode | null = null;
  private sirenGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private musicOn = false;
  private lastSfx: Record<string, number> = {};
  private profile: EngineProfile = ENGINE_PROFILES.thunder;
  private masterVol = 0.85;
  private musicVol = 1;
  private sfxVol = 1;
  private duck = 1;

  unlock() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private init() {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);
      this.music = ctx.createGain();
      this.music.gain.value = 0.2;
      this.music.connect(this.master);

      // noise buffer
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;

      // engine
      this.eOsc1 = ctx.createOscillator();
      this.eOsc1.type = 'sawtooth';
      this.eOsc2 = ctx.createOscillator();
      this.eOsc2.type = 'square';
      const g2 = ctx.createGain();
      g2.gain.value = 0.45;
      this.eFilter = ctx.createBiquadFilter();
      this.eFilter.type = 'lowpass';
      this.eFilter.frequency.value = 700;
      this.eFilter.Q.value = 2;
      this.eGain = ctx.createGain();
      this.eGain.gain.value = 0;
      this.eOsc1.connect(this.eFilter);
      this.eOsc2.connect(g2);
      g2.connect(this.eFilter);
      this.eFilter.connect(this.eGain);
      this.eGain.connect(this.sfx);
      this.eOsc1.frequency.value = 70;
      this.eOsc2.frequency.value = 35;
      this.eOsc1.start();
      this.eOsc2.start();

      // siren
      const so = ctx.createOscillator();
      so.type = 'triangle';
      so.frequency.value = 850;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1.6;
      const lg = ctx.createGain();
      lg.gain.value = 260;
      lfo.connect(lg);
      lg.connect(so.frequency);
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0;
      so.connect(this.sirenGain);
      this.sirenGain.connect(this.sfx);
      so.start();
      lfo.start();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyMaster();
  }

  setMasterVol(v: number) {
    this.masterVol = Math.max(0, Math.min(1, v));
    this.applyMaster();
  }

  setMusicVol(v: number) {
    this.musicVol = Math.max(0, Math.min(1, v));
    this.applyMusic();
  }

  setSfxVol(v: number) {
    this.sfxVol = Math.max(0, Math.min(1, v));
    if (this.ctx) this.sfx.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.05);
  }

  private applyMaster() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterVol, this.ctx.currentTime, 0.03);
  }

  setEngineProfile(id: EngineSound) {
    this.profile = ENGINE_PROFILES[id] || ENGINE_PROFILES.thunder;
    if (!this.ctx || !this.eOsc1 || !this.eOsc2) return;
    try {
      this.eOsc1.type = this.profile.o1;
      this.eOsc2.type = this.profile.o2;
    } catch {
      /* some oscillator combinations are unsupported on old browsers */
    }
  }

  setEngine(pct: number, throttle: number, nitro: boolean, on: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.eOsc1 || !this.eOsc2 || !this.eGain || !this.eFilter) return;
    const now = ctx.currentTime;
    const p = Math.max(0, Math.min(1.4, pct));
    const gear = Math.min(4, Math.floor(p * 5));
    const frac = Math.min(1, p * 5 - gear);
    const f = 58 + gear * 12 + frac * 100 + (nitro ? 34 : 0) + throttle * 8;
    const pr = this.profile;
    this.eOsc1.frequency.setTargetAtTime(f * pr.pitch, now, 0.04);
    this.eOsc2.frequency.setTargetAtTime(f * pr.ratio, now, 0.04);
    this.eFilter.frequency.setTargetAtTime((480 + p * 1500 + throttle * 450 + (nitro ? 500 : 0)) * pr.filter, now, 0.05);
    const gv = on ? (0.05 + p * 0.045 + throttle * 0.02) * pr.gain : 0;
    this.eGain.gain.setTargetAtTime(gv, now, 0.06);
  }

  /** Short blip so a chosen engine sound can be auditioned in Options. */
  previewEngine() {
    this.setEngine(0.55, 0.8, false, true);
    window.setTimeout(() => this.setEngine(0, 0, false, false), 900);
  }

  setSiren(level: number) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(Math.max(0, level) * 0.06, this.ctx.currentTime, 0.1);
  }

  /** Duck factor used when the game is paused (1 = normal). */
  setMusicLevel(v: number) {
    this.duck = v;
    this.applyMusic();
  }

  private applyMusic() {
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(0.2 * this.musicVol * this.duck, this.ctx.currentTime, 0.12);
  }

  /* ---------------- sfx helpers ---------------- */
  private throttleSfx(key: string, ms: number) {
    const n = performance.now();
    if (this.lastSfx[key] && n - this.lastSfx[key] < ms) return false;
    this.lastSfx[key] = n;
    return true;
  }

  private tone(freq: number, dur: number, type: Wave, vol: number, slideTo = 0, delay = 0, dest?: AudioNode) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noiseBurst(dur: number, vol: number, f0: number, f1: number, type: BiquadFilterType = 'lowpass', delay = 0, q = 0.8) {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.03);
  }

  /* ---------------- sfx ---------------- */
  swing() {
    if (!this.throttleSfx('swing', 80)) return;
    this.noiseBurst(0.12, 0.18, 2400, 900, 'bandpass', 0, 1.2);
  }
  punch() {
    this.noiseBurst(0.1, 0.5, 5000, 700, 'bandpass', 0, 0.9);
    this.tone(190, 0.14, 'sine', 0.7, 55);
    this.tone(95, 0.12, 'square', 0.12, 50);
  }
  takedown() {
    this.punch();
    this.tone(523, 0.12, 'square', 0.14, 0, 0.05);
    this.tone(659, 0.12, 'square', 0.14, 0, 0.12);
    this.tone(784, 0.2, 'square', 0.14, 0, 0.19);
    this.noiseBurst(0.5, 0.3, 1800, 120, 'lowpass', 0.05);
  }
  hurt() {
    this.noiseBurst(0.22, 0.5, 3000, 300, 'lowpass');
    this.tone(120, 0.25, 'sawtooth', 0.35, 45);
  }
  crash() {
    this.noiseBurst(0.7, 0.8, 2600, 90, 'lowpass', 0, 0.7);
    this.tone(80, 0.5, 'sine', 0.8, 32);
    this.tone(1800, 0.08, 'square', 0.1, 400, 0.02);
  }
  bump() {
    if (!this.throttleSfx('bump', 120)) return;
    this.noiseBurst(0.18, 0.35, 1500, 200, 'lowpass');
    this.tone(110, 0.15, 'sine', 0.5, 50);
  }
  pickup(kind: string) {
    if (kind === 'rupee') {
      this.tone(988, 0.08, 'square', 0.1);
      this.tone(1319, 0.14, 'square', 0.1, 0, 0.06);
    } else if (kind === 'coconut') {
      this.tone(440, 0.1, 'triangle', 0.35, 880);
      this.tone(660, 0.18, 'triangle', 0.3, 1320, 0.08);
      this.noiseBurst(0.12, 0.15, 5000, 8000, 'highpass', 0.02);
    } else if (kind === 'banana') {
      this.tone(523, 0.1, 'triangle', 0.35);
      this.tone(659, 0.1, 'triangle', 0.35, 0, 0.09);
      this.tone(784, 0.1, 'triangle', 0.35, 0, 0.18);
      this.tone(1047, 0.22, 'triangle', 0.35, 0, 0.27);
    } else {
      this.tone(330, 0.12, 'square', 0.14, 0);
      this.tone(247, 0.18, 'square', 0.14, 0, 0.1);
      this.noiseBurst(0.1, 0.3, 900, 300, 'bandpass', 0.02);
    }
  }
  nearMiss(oncoming: boolean) {
    if (!this.throttleSfx('near', 150)) return;
    this.noiseBurst(0.35, 0.28, 400, 3200, 'bandpass', 0, 1.5);
    if (oncoming) this.horn();
  }
  horn() {
    if (!this.throttleSfx('horn', 500)) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    f.connect(this.sfx);
    const base = 380 + Math.random() * 90;
    this.tone(base, 0.28, 'square', 0.08, base * 0.97, 0, f);
    this.tone(base * 1.26, 0.28, 'square', 0.07, base * 1.22, 0, f);
  }
  nitro() {
    if (!this.throttleSfx('nitro', 300)) return;
    this.noiseBurst(0.7, 0.4, 600, 6000, 'bandpass', 0, 0.8);
    this.tone(160, 0.6, 'sawtooth', 0.15, 520);
  }
  beep(n: number) {
    if (n > 0) this.tone(660, 0.14, 'square', 0.18);
    else {
      this.tone(1320, 0.4, 'square', 0.2);
      this.tone(1760, 0.5, 'triangle', 0.18, 0, 0.05);
    }
  }
  overtake() {
    this.tone(784, 0.07, 'triangle', 0.25);
    this.tone(1175, 0.12, 'triangle', 0.25, 0, 0.07);
  }
  combo(level: number) {
    this.tone(500 + level * 90, 0.1, 'square', 0.1);
  }
  finish(win: boolean) {
    const notes = win ? [523, 659, 784, 1047, 1319] : [392, 349, 330, 262];
    notes.forEach((n, i) => this.tone(n, 0.22, win ? 'square' : 'triangle', 0.16, 0, i * 0.12));
  }
  wasted() {
    [392, 330, 262, 196, 147].forEach((n, i) => this.tone(n, 0.3, 'sawtooth', 0.18, n * 0.9, i * 0.15));
    this.noiseBurst(0.9, 0.5, 1500, 60, 'lowpass', 0.1);
  }
  click() {
    this.tone(880, 0.05, 'square', 0.1);
  }
  siren() {
    /* continuous – see setSiren */
  }

  /* ---------------- music ---------------- */
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 40);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    const stepDur = 60 / BPM / 4;
    if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < ctx.currentTime + 0.2) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private mv(type: Wave, freq: number, t: number, dur: number, vol: number, cutoff = 0, slide = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide > 0) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (cutoff > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private mnoise(t: number, dur: number, vol: number, hp: number) {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.music);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  private playStep(step: number, t: number) {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    // kick
    if (s === 0 || s === 6 || s === 8 || s === 14) this.mv('sine', 150, t, 0.16, 0.9, 0, 45);
    // chenda-like hits: tone drop + noise
    if (s === 3 || s === 7 || s === 10 || s === 11 || s === 15 || (bar === 3 && s === 13)) {
      this.mv('triangle', 330, t, 0.07, 0.38, 0, 160);
      this.mnoise(t, 0.05, 0.22, 2500);
    }
    if (s % 2 === 0) this.mnoise(t, 0.03, 0.12, 7000);
    // bass
    const b = BASS_PATTERN[bar][s];
    if (b >= 0) this.mv('sawtooth', BASE * Math.pow(2, SCALE[b] / 12), t, 0.16, 0.34, 520);
    // lead pluck
    const l = LEAD_PATTERN[bar][s];
    if (l >= 0) {
      const f = BASE * 4 * Math.pow(2, SCALE[l] / 12);
      this.mv('triangle', f, t, 0.18, 0.28, 3000);
      this.mv('sine', f * 2, t, 0.1, 0.07);
    }
  }
}
