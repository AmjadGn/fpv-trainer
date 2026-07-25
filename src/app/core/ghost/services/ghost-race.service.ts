import { Injectable, computed, inject, signal } from '@angular/core';

import type { InterpolatedReplaySample } from '../../replay/utils/replay-interpolation';
import { TrainerSettingsService } from '../../settings/services/trainer-settings.service';
import type { WeatherRecordCategory } from '../../weather/models/weather.models';
import type {
  CourseGhostRecord,
  GhostComparisonSnapshot,
  GhostGateSplit,
  GhostRaceHudState,
  GhostRaceState,
} from '../models/ghost.models';
import {
  computeExactGateSplitDeltaSeconds,
  computeGhostComparison,
} from '../utils/ghost-comparison';
import {
  deriveGhostGateSplits,
  sampleGhostAt,
} from '../utils/ghost-interpolation';
import { GhostStorageService } from './ghost-storage.service';

/**
 * Synchronizes visual-only ghost playback with the live timed run.
 * Never participates in physics, gates, timers, or best-time logic.
 */
@Injectable({ providedIn: 'root' })
export class GhostRaceService {
  private readonly storage = inject(GhostStorageService);
  private readonly settings = inject(TrainerSettingsService);

  private record: CourseGhostRecord | null = null;
  private splits: GhostGateSplit[] = [];
  private gateCount = 0;
  private expectedCourseVersion = 1;
  private expectedEnvironmentId = '';
  private expectedWeatherCategory: WeatherRecordCategory = 'standard';
  private scratchSample: InterpolatedReplaySample | undefined;
  private lastExactSplitDelta: number | null = null;
  private lastExactSplitGate = -1;
  private previousSmoothed: number | null = null;
  private finishedByGhost = false;
  private ghostBeaten: boolean | null = null;
  private finalDelta: number | null = null;

  private readonly stateSignal = signal<GhostRaceState>('unavailable');
  private readonly sampleSignal = signal<InterpolatedReplaySample | null>(null);
  private readonly comparisonSignal = signal<GhostComparisonSnapshot | null>(
    null,
  );
  private readonly messageSignal = signal<string | null>(null);
  private readonly unavailableReasonSignal = signal<string | null>(null);
  private readonly bestTimeSignal = signal<number | null>(null);

  readonly state = this.stateSignal.asReadonly();
  readonly sample = this.sampleSignal.asReadonly();
  readonly comparison = this.comparisonSignal.asReadonly();
  readonly message = this.messageSignal.asReadonly();
  readonly unavailableReason = this.unavailableReasonSignal.asReadonly();
  readonly bestTimeMs = this.bestTimeSignal.asReadonly();

  readonly hud = computed<GhostRaceHudState>(() => {
    const ghostSettings = this.settings.settings().ghost;
    return {
      raceState: this.stateSignal(),
      enabled: ghostSettings.ghostEnabled,
      bestTimeMs: this.bestTimeSignal(),
      comparison: this.comparisonSignal(),
      message: this.messageSignal(),
      unavailableReason: this.unavailableReasonSignal(),
      ghostBeaten: this.ghostBeaten,
      finalDeltaSeconds: this.finalDelta,
    };
  });

  readonly isVisible = computed(() => {
    const ghostSettings = this.settings.settings().ghost;
    if (!ghostSettings.ghostEnabled) {
      return false;
    }
    const s = this.stateSignal();
    return (
      s === 'ready' ||
      s === 'waiting' ||
      s === 'racing' ||
      s === 'finished'
    );
  });

  /**
   * Load ghost for a course. Validates course version, environment, and weather.
   */
  loadForCourse(
    courseId: string,
    gateCount: number,
    options: {
      courseVersion: number;
      environmentId: string;
      weatherCategory?: WeatherRecordCategory;
    },
  ): void {
    this.resetInternal();
    this.expectedCourseVersion = options.courseVersion;
    this.expectedEnvironmentId = options.environmentId;
    this.expectedWeatherCategory = options.weatherCategory ?? 'standard';
    this.gateCount = gateCount;
    this.stateSignal.set('loading');

    const ghost = this.storage.getGhost(courseId, this.expectedWeatherCategory);
    if (!ghost) {
      this.stateSignal.set('unavailable');
      if (this.expectedWeatherCategory !== 'standard') {
        this.messageSignal.set('No ghost for this weather');
        this.unavailableReasonSignal.set('weather_category_mismatch');
      } else {
        this.messageSignal.set('NO GHOST YET');
        this.unavailableReasonSignal.set(null);
      }
      return;
    }

    if (ghost.courseVersion !== options.courseVersion) {
      this.stateSignal.set('error');
      this.messageSignal.set(
        'Ghost unavailable because the course has changed',
      );
      this.unavailableReasonSignal.set('course_version_mismatch');
      this.record = ghost;
      this.bestTimeSignal.set(ghost.finalTimeMs);
      return;
    }

    if (ghost.environmentId !== options.environmentId) {
      this.stateSignal.set('error');
      this.messageSignal.set(
        'Ghost unavailable because the environment has changed',
      );
      this.unavailableReasonSignal.set('environment_mismatch');
      this.record = ghost;
      this.bestTimeSignal.set(ghost.finalTimeMs);
      return;
    }

    const ghostWeather = ghost.weatherCategory ?? 'standard';
    if (ghostWeather !== this.expectedWeatherCategory) {
      this.stateSignal.set('unavailable');
      this.messageSignal.set('No ghost for this weather');
      this.unavailableReasonSignal.set('weather_category_mismatch');
      return;
    }

    if (ghost.replay.metadata.courseId !== courseId) {
      this.stateSignal.set('error');
      this.messageSignal.set('Ghost unavailable');
      this.unavailableReasonSignal.set('course_mismatch');
      return;
    }

    this.record = ghost;
    this.splits = deriveGhostGateSplits(ghost.replay.frames, gateCount);
    this.bestTimeSignal.set(ghost.finalTimeMs);
    this.sampleAt(0);
    this.stateSignal.set('ready');
    this.messageSignal.set('GHOST READY');
  }

  /** Enter countdown: ghost holds start pose. */
  onCountdownStart(): void {
    if (!this.record || this.stateSignal() === 'error') {
      return;
    }
    if (!this.settings.settings().ghost.ghostEnabled) {
      return;
    }
    this.finishedByGhost = false;
    this.ghostBeaten = null;
    this.finalDelta = null;
    this.lastExactSplitDelta = null;
    this.lastExactSplitGate = -1;
    this.previousSmoothed = null;
    this.sampleAt(0);
    this.stateSignal.set('waiting');
    this.messageSignal.set('GHOST READY');
    this.comparisonSignal.set(null);
  }

  /** Live run timer started — ghost timeline at zero. */
  onRunStart(): void {
    if (!this.record || this.stateSignal() === 'error') {
      return;
    }
    if (!this.settings.settings().ghost.ghostEnabled) {
      return;
    }
    this.sampleAt(0);
    this.stateSignal.set('racing');
    this.messageSignal.set(null);
  }

  /**
   * Sync ghost to authoritative run elapsed time (ms).
   * Call from the existing RAF/fixed-step path — no separate timer.
   */
  syncToElapsedMs(
    elapsedMs: number,
    opts: {
      playerGateIndex: number;
      playerCompletedGates: number;
      paused: boolean;
    },
  ): InterpolatedReplaySample | null {
    const state = this.stateSignal();
    if (
      !this.record ||
      state === 'unavailable' ||
      state === 'error' ||
      state === 'loading'
    ) {
      return null;
    }

    if (state === 'waiting' || state === 'ready') {
      return this.sampleSignal();
    }

    if (opts.paused && state === 'racing') {
      return this.sampleSignal();
    }

    if (state !== 'racing' && state !== 'finished') {
      return this.sampleSignal();
    }

    const duration = this.record.replay.metadata.durationMs;
    const t = Math.max(0, elapsedMs);

    if (t >= duration) {
      this.sampleAt(duration);
      if (!this.finishedByGhost && state === 'racing') {
        this.finishedByGhost = true;
        this.stateSignal.set('finished');
      }
    } else if (state === 'racing') {
      this.sampleAt(t);
    }

    const sample = this.sampleSignal();
    if (sample) {
      this.updateComparison(elapsedMs, opts, sample);
    }
    return sample;
  }

  /** Player completed a gate — update exact split delta. */
  onPlayerGateCompleted(gateIndex: number, playerElapsedMs: number): void {
    if (!this.record || this.splits.length === 0) {
      return;
    }
    const delta = computeExactGateSplitDeltaSeconds(
      playerElapsedMs,
      this.splits,
      gateIndex,
    );
    if (delta === null) {
      return;
    }
    this.lastExactSplitDelta = delta;
    this.lastExactSplitGate = gateIndex;
    this.previousSmoothed = delta;
  }

  /** Player finished the run. */
  onPlayerFinished(playerElapsedMs: number): void {
    if (!this.record) {
      return;
    }
    const ghostTime = this.record.finalTimeMs;
    const delta = (playerElapsedMs - ghostTime) / 1000;
    this.finalDelta = Number.isFinite(delta) ? delta : null;
    this.ghostBeaten =
      this.finalDelta !== null ? this.finalDelta < 0 : null;
    this.stateSignal.set('finished');
    if (this.ghostBeaten) {
      this.messageSignal.set('Ghost Beaten');
    } else if (this.ghostBeaten === false) {
      this.messageSignal.set('Ghost Wins');
    }
  }

  onReset(): void {
    if (!this.record) {
      if (this.stateSignal() !== 'unavailable' && this.stateSignal() !== 'error') {
        this.stateSignal.set('unavailable');
      }
      this.sampleSignal.set(null);
      this.comparisonSignal.set(null);
      return;
    }
    const reason = this.unavailableReasonSignal();
    if (
      reason === 'course_version_mismatch' ||
      reason === 'environment_mismatch'
    ) {
      this.stateSignal.set('error');
      return;
    }
    this.finishedByGhost = false;
    this.ghostBeaten = null;
    this.finalDelta = null;
    this.lastExactSplitDelta = null;
    this.lastExactSplitGate = -1;
    this.previousSmoothed = null;
    this.sampleAt(0);
    this.stateSignal.set('ready');
    this.messageSignal.set('GHOST READY');
    this.comparisonSignal.set(null);
  }

  onCancel(): void {
    this.onReset();
  }

  getRecord(): CourseGhostRecord | null {
    return this.record;
  }

  getSplits(): readonly GhostGateSplit[] {
    return this.splits;
  }

  deleteOutdatedGhost(courseId: string): void {
    this.storage.deleteGhost(courseId, this.expectedWeatherCategory);
    this.resetInternal();
    this.stateSignal.set('unavailable');
    this.messageSignal.set('NO GHOST YET');
    this.unavailableReasonSignal.set(null);
  }

  clear(): void {
    this.resetInternal();
    this.stateSignal.set('unavailable');
    this.messageSignal.set(null);
  }

  private sampleAt(timeMs: number): void {
    if (!this.record) {
      this.sampleSignal.set(null);
      return;
    }
    const sample = sampleGhostAt(
      this.record.replay.frames,
      timeMs,
      this.scratchSample,
    );
    this.scratchSample = sample;
    // Publish a shallow copy so consumers don't mutate scratch.
    this.sampleSignal.set({
      ...sample,
      position: { ...sample.position },
      orientation: { ...sample.orientation },
      linearVelocity: { ...sample.linearVelocity },
      angularVelocity: { ...sample.angularVelocity },
    });
  }

  private updateComparison(
    elapsedMs: number,
    opts: {
      playerGateIndex: number;
      playerCompletedGates: number;
    },
    sample: InterpolatedReplaySample,
  ): void {
    const mode = this.settings.settings().ghost.ghostComparisonMode;
    const useApprox = mode === 'approximateLive' || mode === 'both';
    const ghostCompleted = sample.currentGateIndex;
    const dx = 0; // distance filled by host if desired
    const comparison = computeGhostComparison({
      playerElapsedMs: elapsedMs,
      playerGateIndex: opts.playerGateIndex,
      playerCompletedGates: opts.playerCompletedGates,
      ghostGateIndex: sample.currentGateIndex,
      ghostCompletedGates: ghostCompleted,
      ghostSplits: this.splits,
      previousSmoothedDelta: this.previousSmoothed,
      distanceMeters: null,
      lastExactSplitDeltaSeconds: this.lastExactSplitDelta,
      lastExactSplitGateIndex: this.lastExactSplitGate,
      useApproximateLive: useApprox,
    });
    // Always prefer gate splits when mode is gateSplits or both.
    if (mode === 'gateSplits') {
      comparison.liveDeltaSeconds = null;
    }
    this.previousSmoothed = comparison.smoothedDeltaSeconds;
    this.comparisonSignal.set(comparison);
    void dx;
  }

  private resetInternal(): void {
    this.record = null;
    this.splits = [];
    this.gateCount = 0;
    this.expectedEnvironmentId = '';
    this.expectedWeatherCategory = 'standard';
    this.scratchSample = undefined;
    this.lastExactSplitDelta = null;
    this.lastExactSplitGate = -1;
    this.previousSmoothed = null;
    this.finishedByGhost = false;
    this.ghostBeaten = null;
    this.finalDelta = null;
    this.sampleSignal.set(null);
    this.comparisonSignal.set(null);
    this.bestTimeSignal.set(null);
    this.messageSignal.set(null);
    this.unavailableReasonSignal.set(null);
  }
}
