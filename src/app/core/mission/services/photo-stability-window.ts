/**
 * Deterministic rolling stability window for photography capture gating.
 *
 * Driven ONLY by authoritative fixed-step observations: no wall clock, no
 * render frames, no interpolated state. The window counts *contiguous*
 * ticks during which both linear and body angular speed stay within
 * inclusive thresholds; any missing/duplicated/backwards tick, session
 * generation change, or objective change resets the run to zero.
 *
 * Pause is handled by the caller simply not calling `observe` while paused,
 * which surfaces here as a tick gap and therefore resets the run.
 *
 * Pure TypeScript — no Angular, Three.js, Rapier, or persistence.
 */

export interface PhotoStabilityThresholds {
  /** Inclusive maximum linear speed (m/s): stable requires `speed <= max`. */
  readonly maxLinearSpeedMps: number;
  /** Inclusive maximum body angular speed (rad/s): stable requires `speed <= max`. */
  readonly maxBodyAngularSpeedRadps: number;
}

export type PhotoStabilityObserveOutcome =
  | 'accumulated'
  | 'reset-speed'
  | 'reset-tick-gap'
  | 'reset-session'
  | 'reset-objective'
  | 'reset-invalid-input';

export interface PhotoStabilityWindowSnapshot {
  readonly sessionGeneration: number | null;
  readonly objectiveId: string | null;
  readonly lastObservedTick: number | null;
  readonly continuousStableTicks: number;
  readonly requiredDurationTicks: number;
  /** `continuousStableTicks >= requiredDurationTicks`. */
  readonly isStable: boolean;
  readonly lastLinearSpeedMps: number | null;
  readonly lastBodyAngularSpeedRadps: number | null;
  readonly withinLinearSpeed: boolean;
  readonly withinAngularSpeed: boolean;
  readonly thresholds: PhotoStabilityThresholds;
}

const NEUTRAL_THRESHOLDS: PhotoStabilityThresholds = {
  maxLinearSpeedMps: 0,
  maxBodyAngularSpeedRadps: 0,
};

function isFinite(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

export class PhotoStabilityWindow {
  private thresholds: PhotoStabilityThresholds = NEUTRAL_THRESHOLDS;
  private sessionGeneration: number | null = null;
  private objectiveId: string | null = null;
  private lastObservedTick: number | null = null;
  private continuousStableTicks = 0;
  private lastLinearSpeedMps: number | null = null;
  private lastBodyAngularSpeedRadps: number | null = null;
  private withinLinearSpeed = false;
  private withinAngularSpeed = false;

  /**
   * Binds the window to a session generation + objective and clears the run.
   * Call at session start, objective activation, and mission retry.
   */
  beginObjective(
    sessionGeneration: number,
    objectiveId: string,
    thresholds: PhotoStabilityThresholds,
  ): void {
    this.thresholds = thresholds;
    this.sessionGeneration = sessionGeneration;
    this.objectiveId = objectiveId;
    this.clearRun();
    this.lastObservedTick = null;
  }

  /** Full reset — unbinds session/objective and clears the run. */
  reset(): void {
    this.thresholds = NEUTRAL_THRESHOLDS;
    this.sessionGeneration = null;
    this.objectiveId = null;
    this.lastObservedTick = null;
    this.clearRun();
  }

  /**
   * Feeds one authoritative fixed-step observation.
   *
   * Observations belonging to another session generation or another
   * objective reset the run without accumulating: the window only ever
   * counts a contiguous run within a single (session, objective) pair.
   */
  observe(
    tick: number,
    linearSpeedMps: number,
    bodyAngularSpeedRadps: number,
    sessionGeneration: number,
    objectiveId: string,
  ): PhotoStabilityObserveOutcome {
    if (!isFinite(tick) || !isFinite(linearSpeedMps) || !isFinite(bodyAngularSpeedRadps)) {
      this.clearRun();
      return 'reset-invalid-input';
    }

    if (this.sessionGeneration !== null && sessionGeneration !== this.sessionGeneration) {
      this.clearRun();
      return 'reset-session';
    }
    if (this.objectiveId !== null && objectiveId !== this.objectiveId) {
      this.clearRun();
      return 'reset-objective';
    }

    const previousTick = this.lastObservedTick;
    this.lastObservedTick = tick;
    this.lastLinearSpeedMps = linearSpeedMps;
    this.lastBodyAngularSpeedRadps = bodyAngularSpeedRadps;
    this.withinLinearSpeed = linearSpeedMps <= this.thresholds.maxLinearSpeedMps;
    this.withinAngularSpeed = bodyAngularSpeedRadps <= this.thresholds.maxBodyAngularSpeedRadps;

    if (previousTick !== null && tick !== previousTick + 1) {
      this.continuousStableTicks = 0;
      return 'reset-tick-gap';
    }

    if (!this.withinLinearSpeed || !this.withinAngularSpeed) {
      this.continuousStableTicks = 0;
      return 'reset-speed';
    }

    this.continuousStableTicks += 1;
    return 'accumulated';
  }

  snapshot(requiredDurationTicks: number): PhotoStabilityWindowSnapshot {
    const required = isFinite(requiredDurationTicks) ? Math.max(0, requiredDurationTicks) : 0;
    return {
      sessionGeneration: this.sessionGeneration,
      objectiveId: this.objectiveId,
      lastObservedTick: this.lastObservedTick,
      continuousStableTicks: this.continuousStableTicks,
      requiredDurationTicks: required,
      isStable: this.continuousStableTicks >= required,
      lastLinearSpeedMps: this.lastLinearSpeedMps,
      lastBodyAngularSpeedRadps: this.lastBodyAngularSpeedRadps,
      withinLinearSpeed: this.withinLinearSpeed,
      withinAngularSpeed: this.withinAngularSpeed,
      thresholds: this.thresholds,
    };
  }

  private clearRun(): void {
    this.continuousStableTicks = 0;
    this.lastLinearSpeedMps = null;
    this.lastBodyAngularSpeedRadps = null;
    this.withinLinearSpeed = false;
    this.withinAngularSpeed = false;
  }
}

/** Body-frame angular speed magnitude (rad/s) from named flight rates.

 * Flight runtime stores body rates as `{ pitch, yaw, roll }` (see
 * `AuthoritativeBodyAngularVelocity` / `AngularVelocity`). Magnitude is the
 * Euclidean norm of those three named components — axis remapping is
 * unnecessary for a scalar speed gate. Evidence serialization maps the same
 * named rates onto a `Vec3` via `toBodyAngularVelocityVec3` using the
 * repository's existing storage convention (pitch→x, yaw→y, roll→z), which
 * matches `angularToReplay` and the body-rate axes in `quat-math`
 * (ω_x↔pitch, ω_y↔yaw, ω_z↔roll).
 */
export function bodyAngularSpeedMagnitude(rates: {
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;
}): number {
  return Math.hypot(rates.pitch, rates.yaw, rates.roll);
}
