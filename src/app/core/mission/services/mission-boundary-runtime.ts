/**
 * Deterministic out-of-bounds grace countdown for mission runtime.
 *
 * Containment uses `pointInBoundaryShape` from `@fpv/location-validation`
 * so runtime enforcement and authored-content validation can never diverge
 * on what "inside" means.
 *
 * Driven ONLY by authoritative fixed-step observations. Countdown ticks are
 * *contiguous* out-of-bounds ticks: re-entry resets, a tick gap resets
 * (the aircraft may have re-entered during the gap), and pause is handled
 * by the caller not calling `observe`, which surfaces as a tick gap.
 *
 * Grace duration is authored as a wall-clock-equivalent number of seconds
 * (3 s for Coastal Ruins). Tick count is derived from the active
 * `fixedStepSeconds` with ceiling rounding so grace is never shorter than
 * the authored duration. A 180-tick constant is only the 60 Hz compatibility
 * default for authoring/fallback — never an assumption that every session
 * runs at 60 Hz.
 *
 * Pure TypeScript — no Angular, Three.js, Rapier, or persistence.
 */

import type { BoundaryShape } from '@fpv/location-domain';
import { pointInBoundaryShape } from '@fpv/location-validation';
import type { Vec3 } from '@fpv/simulation-contracts';

/** Approved out-of-bounds grace duration in seconds. */
export const OUT_OF_BOUNDS_GRACE_SECONDS = 3;

/**
 * Fallback fixed-step duration used until the real step duration arrives on
 * an authoritative observation (and as the 60 Hz authoring convention).
 */
export const DEFAULT_FIXED_STEP_SECONDS = 1 / 60;

/**
 * 60 Hz compatibility default for authored `graceTicks` fields:
 * `3 s / (1/60 s) = 180`. Runtime must still convert through
 * `graceTicksFromFixedStep` when the active step rate differs.
 */
export const DEFAULT_OUT_OF_BOUNDS_GRACE_TICKS = 180;

/**
 * Converts an authored grace duration into contiguous fixed-step ticks.
 *
 * Rounding policy: **ceiling** — `Math.ceil(graceSeconds / fixedStepSeconds)`
 * — so grace is never shorter than the authored duration. At exact
 * multiples (e.g. 3 / (1/60) = 180) the ceiling is a no-op.
 */
export function graceTicksFromFixedStep(
  graceSeconds: number,
  fixedStepSeconds: number,
): number {
  if (!(Number.isFinite(graceSeconds) && graceSeconds >= 0)) {
    return DEFAULT_OUT_OF_BOUNDS_GRACE_TICKS;
  }
  if (!(Number.isFinite(fixedStepSeconds) && fixedStepSeconds > 0)) {
    return DEFAULT_OUT_OF_BOUNDS_GRACE_TICKS;
  }
  return Math.max(0, Math.ceil(graceSeconds / fixedStepSeconds));
}

/**
 * Interprets an authored `graceTicks` value as a 60 Hz duration encoding.
 * Missions authored before per-session step rates used tick counts that
 * assumed `DEFAULT_FIXED_STEP_SECONDS`.
 */
export function authoredGraceTicksToSeconds(graceTicks: number): number {
  if (!(Number.isFinite(graceTicks) && graceTicks >= 0)) {
    return OUT_OF_BOUNDS_GRACE_SECONDS;
  }
  return graceTicks * DEFAULT_FIXED_STEP_SECONDS;
}

export interface MissionBoundaryRuntimeConfig {
  readonly shape: BoundaryShape;
  /** Authored grace duration in seconds (typically `OUT_OF_BOUNDS_GRACE_SECONDS`). */
  readonly graceSeconds: number;
  readonly fixedStepSeconds: number;
  readonly sessionGeneration: number;
}

export type MissionBoundaryObserveOutcome =
  | 'inside'
  | 'countdown-started'
  | 'countdown-advanced'
  | 'countdown-reset'
  | 'expired'
  | 'already-expired'
  | 'unconfigured'
  | 'stale-session'
  | 'invalid-input';

export interface MissionBoundaryWarningState {
  readonly configured: boolean;
  readonly outOfBounds: boolean;
  readonly graceSeconds: number;
  readonly graceTicks: number;
  readonly continuousOutOfBoundsTicks: number;
  readonly remainingTicks: number;
  /** `remainingTicks * fixedStepSeconds` — never wall-clock. */
  readonly remainingSeconds: number;
  readonly fixedStepSeconds: number;
  /** True once, and permanently after, the grace period has been consumed. */
  readonly expired: boolean;
}

const UNCONFIGURED_STATE: MissionBoundaryWarningState = {
  configured: false,
  outOfBounds: false,
  graceSeconds: 0,
  graceTicks: 0,
  continuousOutOfBoundsTicks: 0,
  remainingTicks: 0,
  remainingSeconds: 0,
  fixedStepSeconds: DEFAULT_FIXED_STEP_SECONDS,
  expired: false,
};

function isFiniteVec3(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export class MissionBoundaryRuntime {
  private config: MissionBoundaryRuntimeConfig | null = null;
  private graceTicks = 0;
  private lastObservedTick: number | null = null;
  private continuousOutOfBoundsTicks = 0;
  private expired = false;

  /** Binds a boundary shape + grace policy and clears any countdown. */
  configure(config: MissionBoundaryRuntimeConfig): void {
    const fixedStepSeconds =
      Number.isFinite(config.fixedStepSeconds) && config.fixedStepSeconds > 0
        ? config.fixedStepSeconds
        : DEFAULT_FIXED_STEP_SECONDS;
    const graceSeconds =
      Number.isFinite(config.graceSeconds) && config.graceSeconds >= 0
        ? config.graceSeconds
        : OUT_OF_BOUNDS_GRACE_SECONDS;
    this.config = {
      shape: config.shape,
      graceSeconds,
      fixedStepSeconds,
      sessionGeneration: config.sessionGeneration,
    };
    this.graceTicks = graceTicksFromFixedStep(graceSeconds, fixedStepSeconds);
    this.reset();
  }

  /** Clears the countdown and the one-shot expiry latch; keeps configuration. */
  reset(): void {
    this.lastObservedTick = null;
    this.continuousOutOfBoundsTicks = 0;
    this.expired = false;
  }

  /**
   * Recomputes grace ticks from the active fixed-step duration.
   * Changing the step rate resets the continuous countdown — the aircraft's
   * prior grace progress is not transferable across step-rate changes.
   */
  updateFixedStepSeconds(fixedStepSeconds: number): void {
    if (!this.config || !(Number.isFinite(fixedStepSeconds) && fixedStepSeconds > 0)) {
      return;
    }
    if (fixedStepSeconds === this.config.fixedStepSeconds) {
      return;
    }
    this.config = { ...this.config, fixedStepSeconds };
    this.graceTicks = graceTicksFromFixedStep(this.config.graceSeconds, fixedStepSeconds);
    this.reset();
  }

  /** Rebinds to a new flight session generation (retry) and clears the countdown. */
  rebindSession(sessionGeneration: number): void {
    if (this.config) {
      this.config = { ...this.config, sessionGeneration };
    }
    this.reset();
  }

  clear(): void {
    this.config = null;
    this.graceTicks = 0;
    this.reset();
  }

  /**
   * Feeds one authoritative fixed-step observation.
   *
   * Returns `'expired'` exactly once per countdown; later observations while
   * still out of bounds return `'already-expired'` so callers fail the
   * mission a single time.
   */
  observe(
    tick: number,
    positionWorld: Vec3,
    sessionGeneration: number,
  ): MissionBoundaryObserveOutcome {
    const config = this.config;
    if (!config) {
      return 'unconfigured';
    }
    if (sessionGeneration !== config.sessionGeneration) {
      return 'stale-session';
    }
    if (!Number.isFinite(tick) || !isFiniteVec3(positionWorld)) {
      return 'invalid-input';
    }

    const previousTick = this.lastObservedTick;
    this.lastObservedTick = tick;

    if (pointInBoundaryShape(positionWorld, config.shape)) {
      const wasCountingDown = this.continuousOutOfBoundsTicks > 0;
      this.continuousOutOfBoundsTicks = 0;
      return wasCountingDown ? 'countdown-reset' : 'inside';
    }

    if (this.expired) {
      return 'already-expired';
    }

    // A tick gap means the aircraft's path between ticks is unknown; restart
    // the countdown rather than crediting ticks that were never observed.
    const contiguous = previousTick !== null && tick === previousTick + 1;
    if (!contiguous) {
      this.continuousOutOfBoundsTicks = 1;
      return this.graceTicks === 0 ? this.expire() : 'countdown-started';
    }

    this.continuousOutOfBoundsTicks += 1;
    if (this.continuousOutOfBoundsTicks > this.graceTicks) {
      return this.expire();
    }
    return this.continuousOutOfBoundsTicks === 1 ? 'countdown-started' : 'countdown-advanced';
  }

  /** Warning presentation data for HUD (remaining grace ticks/seconds). */
  state(): MissionBoundaryWarningState {
    const config = this.config;
    if (!config) {
      return UNCONFIGURED_STATE;
    }
    const remainingTicks = Math.max(0, this.graceTicks - this.continuousOutOfBoundsTicks);
    return {
      configured: true,
      outOfBounds: this.continuousOutOfBoundsTicks > 0,
      graceSeconds: config.graceSeconds,
      graceTicks: this.graceTicks,
      continuousOutOfBoundsTicks: this.continuousOutOfBoundsTicks,
      remainingTicks,
      remainingSeconds: remainingTicks * config.fixedStepSeconds,
      fixedStepSeconds: config.fixedStepSeconds,
      expired: this.expired,
    };
  }

  private expire(): MissionBoundaryObserveOutcome {
    this.expired = true;
    return 'expired';
  }
}
