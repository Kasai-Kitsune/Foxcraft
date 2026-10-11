/**
 * Procedural sound effects via WebAudio — filtered noise bursts tuned per
 * material (grass/stone/wood/sand). No audio files.
 */

import type { SoundKind } from './blocks';

const PARAMS: Record<SoundKind, { f: number; q: number; d: number; type: BiquadFilterType }> = {
  grass: { f: 640, q: 1.2, d: 0.09, type: 'bandpass' },
  dirt: { f: 420, q: 1.0, d: 0.1, type: 'lowpass' },
  stone: { f: 300, q: 1.5, d: 0.08, type: 'lowpass' },
  wood: { f: 520, q: 2.5, d: 0.07, type: 'bandpass' },
  sand: { f: 900, q: 0.8, d: 0.11, type: 'bandpass' },
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Must be called from a user gesture at least once. */
  ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    }
    try {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.35);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
      return true;
    } catch {
      return false;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private burst(kind: SoundKind, gain: number, rate: number, durMul = 1) {
    if (!this.ctx || !this.master || !this.noise || this.muted) return;
    const p = PARAMS[kind];
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const filter = this.ctx.createBiquadFilter();
    filter.type = p.type;
    filter.frequency.value = p.f * (0.85 + Math.random() * 0.3);
    filter.Q.value = p.q;
    const g = this.ctx.createGain();
    const dur = p.d * durMul;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private thump(f: number, gain: number) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f * 0.5), t + 0.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  dig(kind: SoundKind) {
    this.burst(kind, 0.5, 0.9 + Math.random() * 0.25);
  }

  place(kind: SoundKind) {
    this.burst(kind, 0.55, 1.15 + Math.random() * 0.2);
    this.thump(kind === 'stone' ? 90 : 120, 0.18);
  }

  breakBlock(kind: SoundKind) {
    this.burst(kind, 0.65, 0.7 + Math.random() * 0.2, 2.2);
    this.thump(kind === 'stone' ? 70 : 100, 0.28);
  }

  step(kind: SoundKind) {
    this.burst(kind, 0.14, 0.85 + Math.random() * 0.4);
  }
}
