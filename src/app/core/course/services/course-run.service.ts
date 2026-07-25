import { Injectable, computed, signal } from '@angular/core';

import type { Vec3 } from '../../flight/models/flight-state.model';
import type { WeatherRecordCategory } from '../../weather/models/weather.models';
import { DEFAULT_COURSE } from '../config/default-course';
import type { Course, CourseGate } from '../models/course.model';
import {
  INITIAL_RUN_STATE,
  formatRunTime,
  type RunState,
} from '../models/run-state.model';
import {
  detectGateCrossing,
  isInsideGateTrigger,
} from '../utils/gate-crossing';

export type { WeatherRecordCategory };

const BEST_TIME_KEY_PREFIX = 'fpv-trainer.course-best-time.v1.';
const COUNTDOWN_START = 3;
const GO_FLASH_DURATION = 0.55;

/**
 * Owns timed course run state. Does not own flight physics or rendering.
 * Call {@link update} from the fixed-step simulation cadence with previous
 * and current drone positions.
 */
@Injectable({ providedIn: 'root' })
export class CourseRunService {
  private readonly _course = signal<Course>(DEFAULT_COURSE);
  private weatherCategory: WeatherRecordCategory = 'standard';
  private readonly _runState = signal<RunState>({
    ...INITIAL_RUN_STATE,
    bestTimeSeconds: this.loadBestTime(DEFAULT_COURSE.id),
  });

  /** Latch so a single plane crossing is not counted twice while inside. */
  private gateLatchActive = false;
  private latchedGateIndex = -1;

  readonly course = this._course.asReadonly();
  readonly runState = this._runState.asReadonly();

  readonly currentGate = computed<CourseGate | null>(() => {
    const course = this._course();
    const state = this._runState();
    if (state.status !== 'running' && state.status !== 'countdown') {
      return null;
    }
    return course.gates[state.currentGateIndex] ?? null;
  });

  readonly nextGate = computed<CourseGate | null>(() => {
    const course = this._course();
    const state = this._runState();
    const nextIndex = state.currentGateIndex + 1;
    if (state.status !== 'running' && state.status !== 'countdown') {
      return course.gates[0] ?? null;
    }
    return course.gates[nextIndex] ?? null;
  });

  readonly progressPercent = computed(() => {
    const total = this._course().gates.length;
    if (total <= 0) {
      return 0;
    }
    return (this._runState().completedGateCount / total) * 100;
  });

  readonly formattedElapsedTime = computed(() =>
    formatRunTime(this._runState().elapsedSeconds),
  );

  readonly formattedBestTime = computed(() =>
    formatRunTime(this._runState().bestTimeSeconds),
  );

  setCourse(course: Course): void {
    this._course.set(course);
    this.resetRun();
    this.patchState({
      bestTimeSeconds: this.loadBestTime(course.id),
    });
  }

  setWeatherCategory(category: WeatherRecordCategory): void {
    this.weatherCategory = category;
    this.patchState({
      bestTimeSeconds: this.loadBestTime(this._course().id),
    });
  }

  getWeatherCategory(): WeatherRecordCategory {
    return this.weatherCategory;
  }

  /**
   * Enter preparation: idle → ready for countdown.
   * Caller should reset the drone to course start and disarm.
   */
  prepareRun(): void {
    this.gateLatchActive = false;
    this.latchedGateIndex = -1;
    this.patchState({
      status: 'idle',
      currentGateIndex: 0,
      completedGateCount: 0,
      elapsedSeconds: 0,
      countdownSeconds: 0,
      missedGate: false,
      wrongDirection: false,
      finishedAt: null,
      goFlashSeconds: 0,
      invalidReason: null,
    });
  }

  /** Begin 3-2-1 countdown. */
  startCountdown(): void {
    this.gateLatchActive = false;
    this.latchedGateIndex = -1;
    this.patchState({
      status: 'countdown',
      currentGateIndex: 0,
      completedGateCount: 0,
      elapsedSeconds: 0,
      countdownSeconds: COUNTDOWN_START,
      missedGate: false,
      wrongDirection: false,
      finishedAt: null,
      goFlashSeconds: 0,
      invalidReason: null,
    });
  }

  /**
   * Advance run timers and gate detection.
   * Pass the drone positions from the previous and current physics steps.
   */
  update(
    dronePreviousPosition: Vec3,
    droneCurrentPosition: Vec3,
    deltaSeconds: number,
  ): void {
    const dt = deltaSeconds;
    if (!(dt > 0) || !Number.isFinite(dt)) {
      return;
    }

    const state = this._runState();

    if (state.goFlashSeconds > 0) {
      this.patchState({
        goFlashSeconds: Math.max(0, state.goFlashSeconds - dt),
      });
    }

    if (state.status === 'countdown') {
      this.tickCountdown(dt);
      return;
    }

    if (state.status !== 'running') {
      return;
    }

    this.patchState({
      elapsedSeconds: state.elapsedSeconds + dt,
      // Clear transient warnings unless re-triggered this frame.
      missedGate: false,
      wrongDirection: false,
    });

    this.evaluateGateCrossing(dronePreviousPosition, droneCurrentPosition);
  }

  invalidateRun(reason = 'Run invalidated'): void {
    const state = this._runState();
    if (state.status !== 'running' && state.status !== 'countdown') {
      return;
    }
    this.patchState({
      status: 'invalid',
      invalidReason: reason,
      countdownSeconds: 0,
      goFlashSeconds: 0,
    });
  }

  resetRun(): void {
    this.gateLatchActive = false;
    this.latchedGateIndex = -1;
    const best = this.loadBestTime(this._course().id);
    this._runState.set({
      ...INITIAL_RUN_STATE,
      bestTimeSeconds: best,
    });
  }

  finishRun(): void {
    const state = this._runState();
    if (state.status !== 'running') {
      return;
    }
    this.completeWithTime(state.elapsedSeconds);
  }

  clearBestTime(): void {
    const courseId = this._course().id;
    try {
      localStorage.removeItem(bestTimeKey(courseId, this.weatherCategory));
    } catch {
      // Ignore storage failures.
    }
    this.patchState({ bestTimeSeconds: null });
  }

  /** Test helper: inject a best time without localStorage. */
  setBestTimeForTesting(seconds: number | null): void {
    this.patchState({ bestTimeSeconds: seconds });
  }

  private tickCountdown(dt: number): void {
    const state = this._runState();
    const next = state.countdownSeconds - dt;
    if (next > 0) {
      this.patchState({ countdownSeconds: next });
      return;
    }

    // GO — timer starts, gate 1 active.
    this.patchState({
      status: 'running',
      countdownSeconds: 0,
      elapsedSeconds: 0,
      currentGateIndex: 0,
      goFlashSeconds: GO_FLASH_DURATION,
      missedGate: false,
      wrongDirection: false,
    });
  }

  private evaluateGateCrossing(prev: Vec3, curr: Vec3): void {
    const course = this._course();
    const state = this._runState();
    const gate = course.gates[state.currentGateIndex];
    if (!gate) {
      return;
    }

    const inside = isInsideGateTrigger(gate, curr);

    if (this.gateLatchActive && this.latchedGateIndex === gate.index) {
      if (!inside) {
        this.gateLatchActive = false;
        this.latchedGateIndex = -1;
      }
      return;
    }

    const result = detectGateCrossing(gate, prev, curr);
    if (result.type === 'none') {
      return;
    }

    if (result.type === 'wrongDirection') {
      this.patchState({ wrongDirection: true });
      this.latchGate(gate.index);
      return;
    }

    if (result.type === 'missed') {
      this.patchState({ missedGate: true });
      this.latchGate(gate.index);
      // Configurable: do not auto-advance on miss (default).
      if (course.requireValidOpening !== false) {
        return;
      }
    }

    if (result.type === 'valid' || course.requireValidOpening === false) {
      this.completeActiveGate();
    }
  }

  private completeActiveGate(): void {
    const course = this._course();
    const state = this._runState();
    const gate = course.gates[state.currentGateIndex];
    if (!gate) {
      return;
    }

    const completed = state.completedGateCount + 1;
    const nextIndex = state.currentGateIndex + 1;

    this.latchGate(gate.index);

    if (nextIndex >= course.gates.length) {
      this.patchState({
        completedGateCount: completed,
        currentGateIndex: nextIndex,
      });
      this.completeWithTime(state.elapsedSeconds);
      return;
    }

    this.patchState({
      completedGateCount: completed,
      currentGateIndex: nextIndex,
      missedGate: false,
      wrongDirection: false,
    });
  }

  private completeWithTime(elapsedSeconds: number): void {
    const previousBest = this._runState().bestTimeSeconds;
    let best = previousBest;
    if (best === null || elapsedSeconds < best) {
      best = elapsedSeconds;
      this.saveBestTime(this._course().id, best);
    }

    this.patchState({
      status: 'finished',
      elapsedSeconds,
      bestTimeSeconds: best,
      finishedAt: new Date().toISOString(),
      goFlashSeconds: 0,
      missedGate: false,
      wrongDirection: false,
    });
  }

  private latchGate(index: number): void {
    this.gateLatchActive = true;
    this.latchedGateIndex = index;
  }

  private patchState(partial: Partial<RunState>): void {
    this._runState.update((s) => ({ ...s, ...partial }));
  }

  private loadBestTime(courseId: string): number | null {
    try {
      const raw = localStorage.getItem(
        bestTimeKey(courseId, this.weatherCategory),
      );
      if (raw === null) {
        return null;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'seconds' in parsed &&
        typeof (parsed as { seconds: unknown }).seconds === 'number' &&
        Number.isFinite((parsed as { seconds: number }).seconds) &&
        (parsed as { seconds: number }).seconds >= 0
      ) {
        return (parsed as { seconds: number }).seconds;
      }
      // Legacy plain number string.
      const asNumber = Number(raw);
      if (Number.isFinite(asNumber) && asNumber >= 0) {
        return asNumber;
      }
    } catch {
      // Corrupted / unavailable storage — ignore.
    }
    return null;
  }

  private saveBestTime(courseId: string, seconds: number): void {
    try {
      localStorage.setItem(
        bestTimeKey(courseId, this.weatherCategory),
        JSON.stringify({ seconds, savedAt: new Date().toISOString() }),
      );
    } catch {
      // Ignore quota / private-mode failures.
    }
  }
}

export function bestTimeKey(
  courseId: string,
  category: WeatherRecordCategory = 'standard',
): string {
  if (category === 'standard') {
    return `${BEST_TIME_KEY_PREFIX}${courseId}`;
  }
  return `${BEST_TIME_KEY_PREFIX}${courseId}.${category}`;
}
