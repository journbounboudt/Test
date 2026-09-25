/**
 * Procedural WebAudio layer: synthwave music sequencer + SFX. No audio files to download,
 * which keeps Telegram startup light.
 */
type Sfx = 'swipe' | 'pickup' | 'combo' | 'shield' | 'magnet' | 'ult' | 'telegraph' | 'hit' | 'soft' | 'near' | 'finish' | 'chest' | 'click' | 'upgrade' | 'purchase' | 'checkpoint' | 'countdown' | 'go' | 'break' | 'pad' | 'alarm';
type Track = 'menu' | 'run' | null;

const A4 = 440;
const midi = (n: number) => A4 * Math.pow(2, (n - 69) / 12);
// i–VI–III–VII in A minor
const PROG = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private musicOn = true;
  private sfxOn = true;
  private track: Track = null;
  private wanted: Track = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  intensity = 0;
  private lastPickup = 0;
  private pickupRun = 0;

  /** Must be called from a user gesture (autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.42 : 0;
    this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 0.9 : 0;
    this.sfxBus.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    if (this.wanted) this.play(this.wanted);
  }

  setEnabled(music: boolean, sfx: boolean) {
    this.musicOn = music;
    this.sfxOn = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(music ? 0.42 : 0, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(sfx ? 0.9 : 0, t, 0.05);
  }

  play(track: Track) {
    this.wanted = track;
    if (!this.ctx || this.track === track) return;
    this.track = track;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    if (this.timer === null) this.timer = window.setInterval(() => this.schedule(), 25);
    if (!track && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    const bpm = this.track === 'run' ? 132 : 84;
    const stepDur = 60 / bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      if (this.musicOn) {
        if (this.track === 'run') this.runStep(this.step, this.nextTime, stepDur);
        else this.menuStep(this.step, this.nextTime, stepDur);
      }
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private voice(freq: number, t: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; cutoff?: number; bus?: AudioNode; detune?: number; slideTo?: number }) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    if (opts.detune) osc.detune.value = opts.detune;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.1;
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (opts.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.cutoff;
      f.Q.value = 4;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(opts.bus ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseHit(t: number, dur: number, opts: { gain?: number; freq?: number; type?: BiquadFilterType; bus?: AudioNode; sweepTo?: number }) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'highpass';
    f.frequency.setValueAtTime(opts.freq ?? 7000, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(opts.bus ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    this.voice(150, t, 0.28, { type: 'sine', gain: 0.55, slideTo: 42, bus: this.musicBus });
  }

  private runStep(step: number, t: number, sd: number) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = PROG[bar];
    const hot = this.intensity;
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.noiseHit(t, 0.16, { gain: 0.16, freq: 1800, type: 'bandpass', bus: this.musicBus });
    if (s % 2 === 0 || hot > 0.5) this.noiseHit(t, 0.04, { gain: s % 4 === 2 ? 0.07 : 0.035, freq: 8000, bus: this.musicBus });
    if (s % 2 === 0) this.voice(midi(chord[0] - 24), t, sd * 1.8, { type: 'sawtooth', gain: 0.13, cutoff: 380 + hot * 500, bus: this.musicBus });
    const arp = [0, 1, 2, 1, 0, 2, 1, 2];
    const note = chord[arp[s % 8]] + (s >= 8 ? 12 : 0);
    this.voice(midi(note), t, sd * 0.9, { type: 'square', gain: 0.035 + hot * 0.02, cutoff: 1500 + hot * 2500, bus: this.musicBus });
    if (s === 0) for (const n of chord) this.voice(midi(n), t, sd * 15, { type: 'sawtooth', gain: 0.025, attack: 0.3, cutoff: 900 + hot * 900, bus: this.musicBus, detune: 7 });
  }

  private menuStep(step: number, t: number, sd: number) {
    const bar = Math.floor(step / 32) % 4;
    const s = step % 32;
    const chord = PROG[bar];
    if (s === 0) {
      for (const n of chord) {
        this.voice(midi(n - 12), t, sd * 31, { type: 'sawtooth', gain: 0.03, attack: 1.2, cutoff: 700, bus: this.musicBus, detune: -6 });
        this.voice(midi(n), t, sd * 31, { type: 'triangle', gain: 0.03, attack: 1.4, bus: this.musicBus, detune: 5 });
      }
      this.voice(midi(chord[0] - 24), t, sd * 30, { type: 'sine', gain: 0.12, attack: 0.6, bus: this.musicBus });
    }
    if (s % 6 === 0) this.voice(midi(chord[(s / 6) % 3] + 12), t, sd * 5, { type: 'sine', gain: 0.03, attack: 0.02, bus: this.musicBus });
  }

  sfx(name: Sfx, param = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxOn) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'click':
        this.voice(1400, t, 0.05, { type: 'triangle', gain: 0.08 });
        break;
      case 'swipe':
        this.noiseHit(t, 0.14, { gain: 0.09, freq: 900, type: 'bandpass', sweepTo: 3500 });
        break;
      case 'pickup': {
        const now = performance.now();
        this.pickupRun = now - this.lastPickup < 350 ? Math.min(this.pickupRun + 1, 14) : 0;
        this.lastPickup = now;
        const f = midi(76 + [0, 2, 4, 7, 9, 12, 14][this.pickupRun % 7] + (this.pickupRun >= 7 ? 12 : 0));
        this.voice(f, t, 0.12, { type: 'sine', gain: 0.11 });
        this.voice(f * 2, t, 0.06, { type: 'triangle', gain: 0.03 });
        break;
      }
      case 'combo':
        [0, 4, 7, 12].forEach((n, i) => this.voice(midi(72 + n + param), t + i * 0.05, 0.14, { type: 'square', gain: 0.05, cutoff: 3000 }));
        break;
      case 'near':
        this.noiseHit(t, 0.22, { gain: 0.12, freq: 3000, type: 'bandpass', sweepTo: 600 });
        this.voice(midi(88), t, 0.12, { type: 'sine', gain: 0.06 });
        break;
      case 'shield':
        this.voice(220, t, 0.5, { type: 'sine', gain: 0.18, slideTo: 660 });
        this.voice(330, t, 0.5, { type: 'triangle', gain: 0.06, slideTo: 990 });
        break;
      case 'break':
        this.noiseHit(t, 0.35, { gain: 0.25, freq: 2500, type: 'highpass' });
        this.voice(880, t, 0.3, { type: 'square', gain: 0.06, slideTo: 220 });
        break;
      case 'magnet':
        this.voice(300, t, 0.45, { type: 'sawtooth', gain: 0.07, slideTo: 900, cutoff: 1800 });
        break;
      case 'ult':
        this.noiseHit(t, 0.9, { gain: 0.22, freq: 200, type: 'bandpass', sweepTo: 6000 });
        this.voice(55, t, 1.1, { type: 'sawtooth', gain: 0.3, slideTo: 110, cutoff: 900 });
        this.voice(110, t + 0.02, 0.9, { type: 'sine', gain: 0.4, slideTo: 40 });
        break;
      case 'telegraph':
        this.voice(1320, t, 0.08, { type: 'square', gain: 0.04 });
        break;
      case 'soft':
        this.noiseHit(t, 0.18, { gain: 0.2, freq: 600, type: 'lowpass' });
        this.voice(120, t, 0.15, { type: 'sine', gain: 0.25, slideTo: 60 });
        break;
      case 'hit':
        this.noiseHit(t, 0.6, { gain: 0.45, freq: 900, type: 'lowpass', sweepTo: 120 });
        this.voice(90, t, 0.6, { type: 'sawtooth', gain: 0.3, slideTo: 30, cutoff: 500 });
        break;
      case 'checkpoint':
        [0, 7, 12].forEach((n, i) => this.voice(midi(69 + n), t + i * 0.07, 0.3, { type: 'triangle', gain: 0.09 }));
        break;
      case 'pad':
        this.voice(420, t, 0.3, { type: 'sawtooth', gain: 0.07, slideTo: 1600, cutoff: 3000 });
        this.noiseHit(t, 0.3, { gain: 0.1, freq: 800, type: 'bandpass', sweepTo: 7000 });
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) {
          this.voice(620, t + i * 0.36, 0.17, { type: 'square', gain: 0.06, cutoff: 2200 });
          this.voice(460, t + i * 0.36 + 0.18, 0.17, { type: 'square', gain: 0.06, cutoff: 2200 });
        }
        this.voice(55, t, 1.2, { type: 'sawtooth', gain: 0.25, cutoff: 400 });
        break;
      case 'countdown':
        this.voice(midi(69), t, 0.15, { type: 'square', gain: 0.06, cutoff: 2500 });
        break;
      case 'go':
        this.voice(midi(81), t, 0.35, { type: 'square', gain: 0.07, cutoff: 3500 });
        break;
      case 'finish':
        [57, 60, 64, 69, 72].forEach((n, i) => this.voice(midi(n + 12), t + i * 0.06, 0.8, { type: 'sawtooth', gain: 0.05, cutoff: 3000 }));
        break;
      case 'chest':
        [0, 3, 7, 10, 12, 15].forEach((n, i) => this.voice(midi(84 + n), t + i * 0.04, 0.25, { type: 'sine', gain: 0.06 }));
        break;
      case 'upgrade':
        [0, 4, 7, 11, 12].forEach((n, i) => this.voice(midi(64 + n), t + i * 0.05, 0.3, { type: 'triangle', gain: 0.08 }));
        break;
      case 'purchase':
        [0, 7, 12, 16, 19].forEach((n, i) => this.voice(midi(72 + n), t + i * 0.05, 0.35, { type: 'sine', gain: 0.08 }));
        this.noiseHit(t, 0.3, { gain: 0.04, freq: 9000 });
        break;
    }
  }
}

export const audio = new AudioEngine();
