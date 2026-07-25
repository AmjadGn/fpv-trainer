import { Injectable, signal } from '@angular/core';

import type { TrainerAudioSettings } from '../../settings/models/trainer-settings.model';
import type { AudioUnlockState } from '../models/audio.model';
import { volumeToGain } from '../models/audio.model';

/**
 * Central Web Audio context + category gains.
 * Safe if AudioContext is unavailable or autoplay-blocked.
 */
@Injectable({ providedIn: 'root' })
export class AudioManagerService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private motorGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private weatherGain: GainNode | null = null;

  private readonly unlockStateSignal = signal<AudioUnlockState>('locked');
  private readonly needsGestureSignal = signal(false);
  private disposed = false;
  private muted = false;
  private audioEnabled = true;
  private volumes = { master: 70, motor: 65, effects: 80, ui: 60 };
  private ambienceVolumes = { environment: 40, weather: 50 };

  readonly unlockState = this.unlockStateSignal.asReadonly();
  readonly needsGesture = this.needsGestureSignal.asReadonly();

  get context(): AudioContext | null {
    return this.ctx;
  }

  get motorBus(): GainNode | null {
    return this.motorGain;
  }

  get effectsBus(): GainNode | null {
    return this.effectsGain;
  }

  get uiBus(): GainNode | null {
    return this.uiGain;
  }

  get ambienceBus(): GainNode | null {
    return this.ambienceGain;
  }

  get weatherBus(): GainNode | null {
    return this.weatherGain;
  }

  get isReady(): boolean {
    return this.unlockStateSignal() === 'ready' && !!this.ctx;
  }

  applySettings(settings: TrainerAudioSettings): void {
    this.audioEnabled = settings.audioEnabled;
    this.volumes = {
      master: settings.masterVolume,
      motor: settings.motorVolume,
      effects: settings.effectsVolume,
      ui: settings.uiVolume,
    };
    this.rampGains();
  }

  /** Apply environment ambience / weather audio volumes (0–100). */
  applyAmbienceVolumes(environmentVolume: number, weatherVolume: number): void {
    this.ambienceVolumes = {
      environment: environmentVolume,
      weather: weatherVolume,
    };
    this.rampGains();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.rampGains();
  }

  get isMuted(): boolean {
    return this.muted || !this.audioEnabled;
  }

  /**
   * Call from a user gesture. Creates / resumes AudioContext.
   * Never throws; marks unavailable on hard failure.
   */
  async unlock(): Promise<boolean> {
    if (this.disposed) {
      return false;
    }
    if (this.unlockStateSignal() === 'unavailable') {
      return false;
    }
    if (this.isReady && this.ctx?.state === 'running') {
      this.needsGestureSignal.set(false);
      return true;
    }

    this.unlockStateSignal.set('unlocking');
    try {
      if (!this.ctx) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctx) {
          this.unlockStateSignal.set('unavailable');
          this.needsGestureSignal.set(false);
          return false;
        }
        this.ctx = new Ctx();
        this.buildGraph(this.ctx);
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      if (this.ctx.state === 'running') {
        this.unlockStateSignal.set('ready');
        this.needsGestureSignal.set(false);
        this.rampGains();
        return true;
      }

      this.needsGestureSignal.set(true);
      this.unlockStateSignal.set('locked');
      return false;
    } catch {
      this.unlockStateSignal.set('unavailable');
      this.needsGestureSignal.set(false);
      return false;
    }
  }

  /** Soft hint after a failed unlock — shown at most once until success. */
  markNeedsGesture(): void {
    if (this.unlockStateSignal() === 'unavailable' || this.isReady) {
      return;
    }
    this.needsGestureSignal.set(true);
  }

  dismissGestureHint(): void {
    this.needsGestureSignal.set(false);
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  dispose(): void {
    this.disposed = true;
    try {
      void this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
    this.masterGain = null;
    this.motorGain = null;
    this.effectsGain = null;
    this.uiGain = null;
    this.ambienceGain = null;
    this.weatherGain = null;
    this.unlockStateSignal.set('locked');
  }

  private buildGraph(ctx: AudioContext): void {
    this.masterGain = ctx.createGain();
    this.motorGain = ctx.createGain();
    this.effectsGain = ctx.createGain();
    this.uiGain = ctx.createGain();
    this.ambienceGain = ctx.createGain();
    this.weatherGain = ctx.createGain();

    this.motorGain.connect(this.masterGain);
    this.effectsGain.connect(this.masterGain);
    this.uiGain.connect(this.masterGain);
    this.ambienceGain.connect(this.masterGain);
    this.weatherGain.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    this.masterGain.gain.value = 0;
    this.motorGain.gain.value = 0;
    this.effectsGain.gain.value = 0;
    this.uiGain.gain.value = 0;
    this.ambienceGain.gain.value = 0;
    this.weatherGain.gain.value = 0;
    this.rampGains();
  }

  private rampGains(): void {
    if (!this.ctx || !this.masterGain) {
      return;
    }
    const t = this.ctx.currentTime;
    const mute = this.muted || !this.audioEnabled ? 0 : 1;
    const master = volumeToGain(this.volumes.master) * mute;
    const motor = volumeToGain(this.volumes.motor);
    const effects = volumeToGain(this.volumes.effects);
    const ui = volumeToGain(this.volumes.ui);
    const ambience = volumeToGain(this.ambienceVolumes.environment);
    const weather = volumeToGain(this.ambienceVolumes.weather);

    safeSetTarget(this.masterGain.gain, master, t, 0.04);
    safeSetTarget(this.motorGain!.gain, motor, t, 0.04);
    safeSetTarget(this.effectsGain!.gain, effects, t, 0.04);
    safeSetTarget(this.uiGain!.gain, ui, t, 0.04);
    if (this.ambienceGain) {
      safeSetTarget(this.ambienceGain.gain, ambience, t, 0.04);
    }
    if (this.weatherGain) {
      safeSetTarget(this.weatherGain.gain, weather, t, 0.04);
    }
  }
}

function safeSetTarget(
  param: AudioParam,
  value: number,
  now: number,
  timeConstant: number,
): void {
  try {
    param.setTargetAtTime(Math.max(0, value), now, timeConstant);
  } catch {
    try {
      param.value = Math.max(0, value);
    } catch {
      // ignore
    }
  }
}
