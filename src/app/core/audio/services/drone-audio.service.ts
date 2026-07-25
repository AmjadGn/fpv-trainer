import { Injectable, inject } from '@angular/core';

import type { AudioProfile } from '../../aircraft/models/audio-profile.model';
import {
  audioProfileToVoiceParams,
  type MotorVoiceParams,
} from '../../aircraft/factories/aircraft-audio.factory';
import { AudioManagerService } from './audio-manager.service';

export interface MotorAudioState {
  armed: boolean;
  crashed: boolean;
  throttle: number;
  /** Extra demand from stick intensity 0–1. */
  stickDemand?: number;
  paused: boolean;
  /** Playback speed factor for replay (clamped mildly). */
  playbackSpeed?: number;
}

/**
 * Persistent procedural motor hum. Graph created once after unlock.
 * One AudioContext via AudioManager — aircraft profiles retune the voice.
 */
@Injectable({ providedIn: 'root' })
export class DroneAudioService {
  private readonly audio = inject(AudioManagerService);

  private started = false;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private voiceGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private targetGain = 0;
  private targetFreq = 90;
  private voice: MotorVoiceParams = audioProfileToVoiceParams(null);

  applyAudioProfile(profile: AudioProfile | null | undefined): void {
    this.voice = audioProfileToVoiceParams(profile);
    if (this.filter) {
      try {
        this.filter.Q.value = this.voice.resonanceQ;
      } catch {
        // ignore
      }
    }
    if (this.noiseGain) {
      try {
        this.noiseGain.gain.value = this.voice.noiseGain;
      } catch {
        // ignore
      }
    }
  }

  ensureStarted(): void {
    if (this.started || !this.audio.isReady || !this.audio.context) {
      return;
    }
    const ctx = this.audio.context;
    const bus = this.audio.motorBus;
    if (!bus) {
      return;
    }

    try {
      this.voiceGain = ctx.createGain();
      this.voiceGain.gain.value = 0;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = this.voice.filterBaseHz;
      this.filter.Q.value = this.voice.resonanceQ;

      this.oscA = ctx.createOscillator();
      this.oscA.type = 'sawtooth';
      this.oscA.frequency.value = this.voice.idleFrequencyHz;

      this.oscB = ctx.createOscillator();
      this.oscB.type = 'triangle';
      this.oscB.frequency.value =
        this.voice.idleFrequencyHz * this.voice.harmonicRatio;

      const noiseBuf = createNoiseBuffer(ctx, 1.5);
      this.noise = ctx.createBufferSource();
      this.noise.buffer = noiseBuf;
      this.noise.loop = true;

      this.noiseGain = ctx.createGain();
      this.noiseGain.gain.value = this.voice.noiseGain;

      this.oscA.connect(this.filter);
      this.oscB.connect(this.filter);
      this.noise.connect(this.noiseGain);
      this.noiseGain.connect(this.filter);
      this.filter.connect(this.voiceGain);
      this.voiceGain.connect(bus);

      this.oscA.start();
      this.oscB.start();
      this.noise.start();
      this.started = true;
    } catch {
      this.started = false;
    }
  }

  update(state: MotorAudioState): void {
    this.ensureStarted();
    if (!this.started || !this.audio.context || !this.voiceGain) {
      return;
    }

    const speed = clamp(state.playbackSpeed ?? 1, 0.5, 1.5);
    const v = this.voice;
    let gain = 0;
    let freq = v.idleFrequencyHz;

    if (state.paused || this.audio.isMuted) {
      gain = 0;
    } else if (state.crashed) {
      gain = v.crashGain;
      freq = v.crashFrequencyHz;
    } else if (!state.armed) {
      gain = 0;
      freq = v.idleFrequencyHz * 0.85;
    } else {
      const thr = clamp(state.throttle, 0, 1);
      const stick = clamp(state.stickDemand ?? 0, 0, 1);
      const demand = thr * 0.85 + stick * 0.15;
      gain = v.baseGain + demand * v.demandGain;
      freq =
        (v.idleFrequencyHz +
          demand * (v.maxFrequencyHz - v.idleFrequencyHz)) *
        speed;
    }

    this.targetGain = gain;
    this.targetFreq = freq;
    const t = this.audio.now();
    try {
      this.voiceGain.gain.setTargetAtTime(this.targetGain, t, 0.06);
      this.oscA?.frequency.setTargetAtTime(this.targetFreq, t, 0.05);
      this.oscB?.frequency.setTargetAtTime(
        this.targetFreq * v.harmonicRatio,
        t,
        0.05,
      );
      this.filter?.frequency.setTargetAtTime(
        v.filterBaseHz + clamp(state.throttle, 0, 1) * v.filterThrottleSpanHz,
        t,
        0.08,
      );
    } catch {
      // ignore param errors — never affect physics
    }
  }

  dispose(): void {
    try {
      this.oscA?.stop();
      this.oscB?.stop();
      this.noise?.stop();
    } catch {
      // ignore
    }
    this.oscA = null;
    this.oscB = null;
    this.noise = null;
    this.filter = null;
    this.voiceGain = null;
    this.noiseGain = null;
    this.started = false;
  }
}

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
