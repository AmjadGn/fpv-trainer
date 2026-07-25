import { Injectable, computed, signal } from '@angular/core';

import type { ReplayCameraMode, ReplayPlaybackSpeed } from '../../settings/models/trainer-settings.model';
import type { FlightReplay, ReplayFrame, ReplayPlaybackState } from '../models/replay.model';
import {
  sampleReplayAt,
  type InterpolatedReplaySample,
} from '../utils/replay-interpolation';
import { validateReplay } from '../utils/replay-validation';

const SPEEDS: ReplayPlaybackSpeed[] = [0.25, 0.5, 1, 2];
const CAMERAS: ReplayCameraMode[] = ['fpv', 'chase', 'orbit'];

/**
 * Visual playback of a recorded run. Does not drive physics or best times.
 */
@Injectable({ providedIn: 'root' })
export class ReplayPlaybackService {
  private replay: FlightReplay | null = null;
  private readonly sampleScratch: InterpolatedReplaySample = {
    timestampMs: 0,
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    linearVelocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    throttle: 0,
    armed: false,
    crashed: false,
    currentGateIndex: 0,
    alpha: 0,
    frameIndex: 0,
  };

  private lastGateIndex = -1;
  private suppressEventSounds = false;
  private wasPlayingBeforeScrub = false;

  private readonly stateSignal = signal<ReplayPlaybackState>('idle');
  private readonly currentTimeSignal = signal(0);
  private readonly durationSignal = signal(0);
  private readonly speedSignal = signal<ReplayPlaybackSpeed>(1);
  private readonly cameraSignal = signal<ReplayCameraMode>('fpv');
  private readonly errorSignal = signal<string | null>(null);
  private readonly sampleSignal = signal<InterpolatedReplaySample | null>(null);
  private readonly gateEventSignal = signal<number | null>(null);
  private readonly finishEventSignal = signal(false);

  readonly state = this.stateSignal.asReadonly();
  readonly currentTimeMs = this.currentTimeSignal.asReadonly();
  readonly durationMs = this.durationSignal.asReadonly();
  readonly playbackSpeed = this.speedSignal.asReadonly();
  readonly selectedReplayCamera = this.cameraSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly currentSample = this.sampleSignal.asReadonly();
  /** Gate index that just increased during forward playback (consume once). */
  readonly gateEvent = this.gateEventSignal.asReadonly();
  readonly finishEvent = this.finishEventSignal.asReadonly();

  readonly progress = computed(() => {
    const dur = this.durationSignal();
    if (!(dur > 0)) {
      return 0;
    }
    return Math.min(1, Math.max(0, this.currentTimeSignal() / dur));
  });

  readonly isActive = computed(() => {
    const s = this.stateSignal();
    return (
      s === 'playing' ||
      s === 'paused' ||
      s === 'finished' ||
      s === 'loading'
    );
  });

  load(
    replay: FlightReplay,
    defaults?: { camera?: ReplayCameraMode; speed?: ReplayPlaybackSpeed },
  ): boolean {
    this.stateSignal.set('loading');
    this.errorSignal.set(null);
    this.finishEventSignal.set(false);
    this.gateEventSignal.set(null);

    const validated = validateReplay(replay);
    if (!validated.ok) {
      this.replay = null;
      this.stateSignal.set('error');
      this.errorSignal.set(validated.reason);
      this.sampleSignal.set(null);
      return false;
    }

    this.replay = validated.replay;
    this.durationSignal.set(validated.replay.metadata.durationMs);
    this.currentTimeSignal.set(0);
    this.speedSignal.set(defaults?.speed ?? 1);
    this.cameraSignal.set(defaults?.camera ?? 'fpv');
    this.lastGateIndex = validated.replay.frames[0]?.currentGateIndex ?? 0;
    this.suppressEventSounds = false;
    this.refreshSample(0);
    this.stateSignal.set('paused');
    return true;
  }

  play(): void {
    if (!this.replay) {
      return;
    }
    if (this.stateSignal() === 'finished') {
      this.seek(0);
    }
    this.suppressEventSounds = false;
    this.stateSignal.set('playing');
  }

  pause(): void {
    if (this.stateSignal() === 'playing') {
      this.stateSignal.set('paused');
    }
  }

  togglePlayPause(): void {
    if (this.stateSignal() === 'playing') {
      this.pause();
    } else if (
      this.stateSignal() === 'paused' ||
      this.stateSignal() === 'finished'
    ) {
      this.play();
    }
  }

  restart(): void {
    this.seek(0);
    this.lastGateIndex = this.replay?.frames[0]?.currentGateIndex ?? 0;
    this.gateEventSignal.set(null);
    this.finishEventSignal.set(false);
    this.suppressEventSounds = false;
    this.stateSignal.set('playing');
  }

  stop(): void {
    this.replay = null;
    this.stateSignal.set('idle');
    this.currentTimeSignal.set(0);
    this.durationSignal.set(0);
    this.sampleSignal.set(null);
    this.errorSignal.set(null);
    this.gateEventSignal.set(null);
    this.finishEventSignal.set(false);
  }

  setSpeed(speed: ReplayPlaybackSpeed): void {
    if (SPEEDS.includes(speed)) {
      this.speedSignal.set(speed);
    }
  }

  cycleSpeed(): void {
    const idx = SPEEDS.indexOf(this.speedSignal());
    this.speedSignal.set(SPEEDS[(idx + 1) % SPEEDS.length]);
  }

  setCamera(camera: ReplayCameraMode): void {
    if (CAMERAS.includes(camera)) {
      this.cameraSignal.set(camera);
    }
  }

  cycleCamera(): void {
    const allowed: ReplayCameraMode[] =
      this.stateSignal() === 'paused' || this.stateSignal() === 'finished'
        ? CAMERAS
        : ['fpv', 'chase'];
    const current = this.cameraSignal();
    const idx = allowed.indexOf(current);
    const next = allowed[(idx + 1) % allowed.length] ?? 'fpv';
    this.cameraSignal.set(next);
  }

  beginScrub(): void {
    this.wasPlayingBeforeScrub = this.stateSignal() === 'playing';
    this.suppressEventSounds = true;
    if (this.wasPlayingBeforeScrub) {
      this.stateSignal.set('paused');
    }
  }

  scrubTo(timeMs: number): void {
    this.suppressEventSounds = true;
    this.seek(timeMs);
  }

  endScrub(): void {
    this.lastGateIndex =
      this.sampleSignal()?.currentGateIndex ?? this.lastGateIndex;
    this.suppressEventSounds = false;
    if (this.wasPlayingBeforeScrub && this.stateSignal() !== 'finished') {
      this.stateSignal.set('playing');
    }
    this.wasPlayingBeforeScrub = false;
  }

  seek(timeMs: number): void {
    const dur = this.durationSignal();
    const clamped = Math.min(Math.max(0, timeMs), dur);
    this.currentTimeSignal.set(clamped);
    this.refreshSample(clamped);
    if (clamped >= dur && dur > 0) {
      this.stateSignal.set('finished');
    } else if (this.stateSignal() === 'finished') {
      this.stateSignal.set('paused');
    }
  }

  seekBy(deltaMs: number): void {
    this.seek(this.currentTimeSignal() + deltaMs);
  }

  /**
   * Advance playback clock. Call from the existing RAF onFrame / fixed path
   * while state === playing. Does not run physics.
   */
  tick(deltaSeconds: number): InterpolatedReplaySample | null {
    if (this.stateSignal() !== 'playing' || !this.replay) {
      return this.sampleSignal();
    }

    const next =
      this.currentTimeSignal() + deltaSeconds * 1000 * this.speedSignal();
    const dur = this.durationSignal();

    if (next >= dur) {
      this.currentTimeSignal.set(dur);
      this.refreshSample(dur);
      this.emitGateIfNeeded();
      if (!this.suppressEventSounds) {
        this.finishEventSignal.set(true);
      }
      this.stateSignal.set('finished');
      return this.sampleSignal();
    }

    this.currentTimeSignal.set(next);
    this.refreshSample(next);
    this.emitGateIfNeeded();
    return this.sampleSignal();
  }

  consumeGateEvent(): number | null {
    const v = this.gateEventSignal();
    this.gateEventSignal.set(null);
    return v;
  }

  consumeFinishEvent(): boolean {
    const v = this.finishEventSignal();
    this.finishEventSignal.set(false);
    return v;
  }

  getFrames(): readonly ReplayFrame[] {
    return this.replay?.frames ?? [];
  }

  getReplay(): FlightReplay | null {
    return this.replay;
  }

  private refreshSample(timeMs: number): void {
    if (!this.replay) {
      this.sampleSignal.set(null);
      return;
    }
    const sample = sampleReplayAt(
      this.replay.frames,
      timeMs,
      this.sampleScratch,
    );
    // Publish a shallow copy so signal consumers see a new reference when needed.
    this.sampleSignal.set({
      timestampMs: sample.timestampMs,
      position: { ...sample.position },
      orientation: { ...sample.orientation },
      linearVelocity: { ...sample.linearVelocity },
      angularVelocity: { ...sample.angularVelocity },
      throttle: sample.throttle,
      armed: sample.armed,
      crashed: sample.crashed,
      currentGateIndex: sample.currentGateIndex,
      alpha: sample.alpha,
      frameIndex: sample.frameIndex,
    });
  }

  private emitGateIfNeeded(): void {
    if (this.suppressEventSounds) {
      return;
    }
    const sample = this.sampleSignal();
    if (!sample) {
      return;
    }
    if (sample.currentGateIndex > this.lastGateIndex) {
      this.gateEventSignal.set(sample.currentGateIndex);
      this.lastGateIndex = sample.currentGateIndex;
    } else if (sample.currentGateIndex < this.lastGateIndex) {
      // Seeked backward — reset cursor without sounding.
      this.lastGateIndex = sample.currentGateIndex;
    }
  }
}
