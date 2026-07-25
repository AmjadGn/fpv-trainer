import { Injectable, inject } from '@angular/core';

import { AudioManagerService } from './audio-manager.service';

export type GameplaySoundId =
  | 'countdown'
  | 'go'
  | 'gate'
  | 'invalid'
  | 'finish'
  | 'best'
  | 'crash'
  | 'reset'
  | 'arm'
  | 'disarm'
  | 'pause'
  | 'resume'
  | 'ui'
  | 'ghostReady'
  | 'splitAhead'
  | 'splitBehind'
  | 'ghostBeaten'
  | 'trainingSuccess'
  | 'trainingFail'
  | 'medal'
  | 'achievement'
  | 'xp';

/**
 * Short procedural one-shots on the shared AudioContext.
 */
@Injectable({ providedIn: 'root' })
export class GameplayAudioService {
  private readonly audio = inject(AudioManagerService);
  private suppressEffects = false;

  setSuppressEffects(suppress: boolean): void {
    this.suppressEffects = suppress;
  }

  play(id: GameplaySoundId, opts?: { step?: number }): void {
    if (this.suppressEffects || this.audio.isMuted || !this.audio.isReady) {
      return;
    }
    const ctx = this.audio.context;
    const bus =
      id === 'ui' || id === 'achievement' || id === 'xp'
        ? this.audio.uiBus
        : this.audio.effectsBus;
    if (!ctx || !bus) {
      return;
    }

    try {
      switch (id) {
        case 'countdown': {
          const step = opts?.step ?? 3;
          const freq = 440 + (3 - Math.min(3, Math.max(1, step))) * 120;
          this.tone(ctx, bus, freq, 0.08, 0.05, 'sine');
          break;
        }
        case 'go':
          this.tone(ctx, bus, 880, 0.16, 0.07, 'sine');
          break;
        case 'gate':
          this.tone(ctx, bus, 660, 0.07, 0.05, 'triangle');
          this.schedule(() => this.tone(ctx, bus, 880, 0.07, 0.04, 'triangle'), 70);
          break;
        case 'invalid':
          this.noiseBurst(ctx, bus, 0.22, 0.06, 180);
          break;
        case 'finish':
          this.tone(ctx, bus, 523, 0.1, 0.05, 'sine');
          this.schedule(() => this.tone(ctx, bus, 659, 0.12, 0.05, 'sine'), 90);
          this.schedule(() => this.tone(ctx, bus, 784, 0.16, 0.045, 'sine'), 190);
          break;
        case 'best':
          this.tone(ctx, bus, 587, 0.1, 0.055, 'sine');
          this.schedule(() => this.tone(ctx, bus, 740, 0.12, 0.05, 'sine'), 100);
          this.schedule(() => this.tone(ctx, bus, 880, 0.18, 0.05, 'triangle'), 210);
          break;
        case 'crash':
          this.noiseBurst(ctx, bus, 0.28, 0.09, 90);
          break;
        case 'reset':
          this.tone(ctx, bus, 320, 0.08, 0.035, 'sine');
          break;
        case 'arm':
          this.tone(ctx, bus, 520, 0.06, 0.035, 'sine');
          this.schedule(() => this.tone(ctx, bus, 700, 0.08, 0.03, 'sine'), 55);
          break;
        case 'disarm':
          this.tone(ctx, bus, 400, 0.07, 0.03, 'sine');
          this.schedule(() => this.tone(ctx, bus, 280, 0.09, 0.028, 'sine'), 60);
          break;
        case 'pause':
          this.tone(ctx, bus, 360, 0.09, 0.03, 'triangle');
          break;
        case 'resume':
          this.tone(ctx, bus, 480, 0.08, 0.03, 'triangle');
          break;
        case 'ui':
          this.tone(ctx, bus, 640, 0.04, 0.025, 'sine');
          break;
        case 'ghostReady':
          this.tone(ctx, bus, 480, 0.07, 0.03, 'sine');
          this.schedule(() => this.tone(ctx, bus, 640, 0.08, 0.028, 'triangle'), 60);
          break;
        case 'splitAhead':
          this.tone(ctx, bus, 720, 0.05, 0.028, 'sine');
          break;
        case 'splitBehind':
          this.tone(ctx, bus, 380, 0.06, 0.026, 'triangle');
          break;
        case 'ghostBeaten':
          this.tone(ctx, bus, 560, 0.08, 0.04, 'sine');
          this.schedule(() => this.tone(ctx, bus, 740, 0.1, 0.035, 'sine'), 80);
          this.schedule(() => this.tone(ctx, bus, 920, 0.12, 0.03, 'triangle'), 170);
          break;
        case 'trainingSuccess':
          this.tone(ctx, bus, 523, 0.08, 0.04, 'sine');
          this.schedule(() => this.tone(ctx, bus, 698, 0.1, 0.035, 'sine'), 85);
          break;
        case 'trainingFail':
          this.tone(ctx, bus, 300, 0.1, 0.03, 'triangle');
          this.schedule(() => this.tone(ctx, bus, 220, 0.12, 0.025, 'sine'), 90);
          break;
        case 'medal':
          this.tone(ctx, bus, 660, 0.07, 0.04, 'triangle');
          this.schedule(() => this.tone(ctx, bus, 880, 0.1, 0.035, 'sine'), 75);
          break;
        case 'achievement':
          this.tone(ctx, bus, 540, 0.07, 0.035, 'sine');
          this.schedule(() => this.tone(ctx, bus, 720, 0.09, 0.03, 'triangle'), 70);
          break;
        case 'xp':
          this.tone(ctx, bus, 800, 0.045, 0.022, 'sine');
          break;
      }
    } catch {
      // ignore
    }
  }

  // Convenience wrappers matching previous TrainingAudio API.
  beepCountdown(step: number): void {
    this.play('countdown', { step });
  }

  beepGo(): void {
    this.play('go');
  }

  beepGate(): void {
    this.play('gate');
  }

  beepInvalid(): void {
    this.play('invalid');
  }

  private tone(
    ctx: AudioContext,
    bus: GainNode,
    frequency: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(bus);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.03);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };
  }

  private noiseBurst(
    ctx: AudioContext,
    bus: GainNode,
    duration: number,
    gainValue: number,
    cutoff: number,
  ): void {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 98765;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.start(now);
    src.stop(now + duration + 0.02);
    src.onended = () => {
      try {
        src.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };
  }

  private schedule(fn: () => void, ms: number): void {
    window.setTimeout(fn, ms);
  }
}
