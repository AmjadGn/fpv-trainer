import type { TrainingMedalThresholds } from '../../models/training-module.models';
import type {
  TrainingEvaluation,
  TrainingEvaluator,
  TrainingEvaluatorEvent,
  TrainingEvaluatorStartContext,
  TrainingPenalty,
  TrainingSessionSnapshot,
} from '../../models/training-session.models';

interface LandingConfig {
  padCenter: { x: number; y: number; z: number };
  padRadius: number;
  maxVerticalSpeed: number;
  maxImpactSpeed: number;
  maxTiltRadians: number;
  confirmSeconds: number;
  crashFails: boolean;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function medalFromScore(
  score: number,
  thresholds: TrainingMedalThresholds,
): TrainingEvaluation['medal'] {
  if (score >= thresholds.gold) {
    return 'gold';
  }
  if (score >= thresholds.silver) {
    return 'silver';
  }
  if (score >= thresholds.bronze) {
    return 'bronze';
  }
  return 'none';
}

function tiltFromQuat(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): number {
  // World up vs body up angle from quaternion (acos of body Y vs world Y).
  const ux = 2 * (q.x * q.y - q.w * q.z);
  const uy = 1 - 2 * (q.x * q.x + q.z * q.z);
  const uz = 2 * (q.y * q.z + q.w * q.x);
  const len = Math.hypot(ux, uy, uz);
  if (!(len > 0) || !Number.isFinite(len)) {
    return Math.PI;
  }
  const dot = clamp(uy / len, -1, 1);
  const angle = Math.acos(dot);
  return Number.isFinite(angle) ? angle : Math.PI;
}

/**
 * Pure landing evaluator: soft, centered, level touchdown with confirm window.
 */
export class LandingEvaluator implements TrainingEvaluator {
  private config: LandingConfig = {
    padCenter: { x: 8, y: 0, z: -20 },
    padRadius: 1.5,
    maxVerticalSpeed: 1.2,
    maxImpactSpeed: 2.5,
    maxTiltRadians: 0.45,
    confirmSeconds: 0.6,
    crashFails: true,
  };
  private thresholds: TrainingMedalThresholds = {
    bronze: 55,
    silver: 75,
    gold: 90,
  };
  private started = false;
  private completed = false;
  private failed = false;
  private confirmAccum = 0;
  private contactLatched = false;
  private impactVertical = 0;
  private impactSpeed = 0;
  private impactHorizontal = 0;
  private impactTilt = 0;
  private elapsedAtSuccess = 0;
  private penalties: TrainingPenalty[] = [];
  private lastMessage = 'Approach the landing pad.';

  start(context: TrainingEvaluatorStartContext): void {
    this.reset();
    const raw = context.module.evaluatorConfig;
    this.thresholds = { ...context.module.medalThresholds };
    const padRaw = raw['padCenter'];
    const pad =
      padRaw && typeof padRaw === 'object'
        ? (padRaw as Record<string, unknown>)
        : {};
    this.config = {
      padCenter: {
        x: num(pad['x'], 8),
        y: num(pad['y'], 0),
        z: num(pad['z'], -20),
      },
      padRadius: num(raw['padRadius'], 1.5),
      maxVerticalSpeed: num(raw['maxVerticalSpeed'], 1.2),
      maxImpactSpeed: num(raw['maxImpactSpeed'], 2.5),
      maxTiltRadians: num(raw['maxTiltRadians'], 0.45),
      confirmSeconds: num(raw['confirmSeconds'], 0.6),
      crashFails: raw['crashFails'] !== false,
    };
    this.started = true;
  }

  update(snapshot: TrainingSessionSnapshot): void {
    if (!this.started || this.completed || this.failed) {
      return;
    }

    const dt = Number.isFinite(snapshot.deltaSeconds)
      ? Math.max(0, snapshot.deltaSeconds)
      : 0;

    if (snapshot.crashed && this.config.crashFails) {
      this.fail('crash', 'Crash', 25, 'Crash — landing failed.');
      return;
    }

    const altitude = Number.isFinite(snapshot.altitude)
      ? snapshot.altitude
      : snapshot.position.y;
    const vy = Number.isFinite(snapshot.velocity.y) ? snapshot.velocity.y : 0;
    const descending = vy < -0.05;
    const grounded = altitude < 0.15 && (descending || this.contactLatched);

    if (!grounded) {
      this.confirmAccum = 0;
      this.contactLatched = false;
      this.lastMessage = 'Descend onto the pad.';
      return;
    }

    const dx = snapshot.position.x - this.config.padCenter.x;
    const dz = snapshot.position.z - this.config.padCenter.z;
    const horizontal = Math.hypot(
      Number.isFinite(dx) ? dx : 0,
      Number.isFinite(dz) ? dz : 0,
    );
    const speed = Number.isFinite(snapshot.speed) ? snapshot.speed : 0;
    const verticalSpeed = Math.abs(vy);
    const tilt = tiltFromQuat(snapshot.orientation);

    if (!this.contactLatched) {
      this.contactLatched = true;
      this.impactHorizontal = horizontal;
      this.impactSpeed = speed;
      this.impactVertical = verticalSpeed;
      this.impactTilt = tilt;

      if (horizontal > this.config.padRadius) {
        this.fail(
          'outside-pad',
          'Outside pad',
          20,
          'Touchdown outside the pad.',
        );
        return;
      }
      if (verticalSpeed > this.config.maxVerticalSpeed) {
        this.fail(
          'hard-vertical',
          'Hard landing (vertical)',
          18,
          'Vertical speed too high.',
        );
        return;
      }
      if (speed > this.config.maxImpactSpeed) {
        this.fail(
          'hard-impact',
          'Hard landing (speed)',
          18,
          'Impact speed too high.',
        );
        return;
      }
      if (tilt > this.config.maxTiltRadians) {
        this.fail('tilt', 'Excessive tilt', 15, 'Attitude too steep at contact.');
        return;
      }
    }

    this.confirmAccum += dt;
    this.lastMessage = 'Settling on pad…';
    if (this.confirmAccum >= this.config.confirmSeconds) {
      this.completed = true;
      this.elapsedAtSuccess = Number.isFinite(snapshot.elapsedMs)
        ? snapshot.elapsedMs
        : 0;
      this.lastMessage = 'Precision landing complete.';
    }
  }

  handleEvent(_event: TrainingEvaluatorEvent): void {
    // Landing evaluator is snapshot-driven.
  }

  /** True when the attempt succeeded or hard-failed. */
  isTerminal(): boolean {
    return this.completed || this.failed;
  }

  finish(): TrainingEvaluation {
    const accuracy = clamp(
      100 - (this.impactHorizontal / Math.max(0.001, this.config.padRadius)) * 55,
      0,
      100,
    );
    const softness = clamp(
      100 -
        (this.impactVertical / Math.max(0.001, this.config.maxVerticalSpeed)) *
          50 -
        (this.impactSpeed / Math.max(0.001, this.config.maxImpactSpeed)) * 30,
      0,
      100,
    );
    const attitude = clamp(
      100 -
        (this.impactTilt / Math.max(0.001, this.config.maxTiltRadians)) * 70,
      0,
      100,
    );
    const timeScore = clamp(100 - this.elapsedAtSuccess / 600, 25, 100);

    let score =
      accuracy * 0.35 + softness * 0.3 + attitude * 0.2 + timeScore * 0.15;
    if (!this.completed) {
      score = Math.min(score, 40);
    }
    const penaltyTotal = this.penalties.reduce((sum, p) => sum + p.amount, 0);
    score = clamp(score - penaltyTotal, 0, 100);

    return {
      completed: this.completed,
      score: Number.isFinite(score) ? score : 0,
      medal: this.completed
        ? medalFromScore(score, this.thresholds)
        : 'none',
      metrics: {
        impactHorizontal: Number.isFinite(this.impactHorizontal)
          ? this.impactHorizontal
          : 0,
        impactVertical: Number.isFinite(this.impactVertical)
          ? this.impactVertical
          : 0,
        impactSpeed: Number.isFinite(this.impactSpeed) ? this.impactSpeed : 0,
        impactTilt: Number.isFinite(this.impactTilt) ? this.impactTilt : 0,
        confirmSeconds: Number.isFinite(this.confirmAccum)
          ? this.confirmAccum
          : 0,
        durationMs: Number.isFinite(this.elapsedAtSuccess)
          ? this.elapsedAtSuccess
          : 0,
      },
      penalties: [...this.penalties],
      message: this.lastMessage,
    };
  }

  reset(): void {
    this.started = false;
    this.completed = false;
    this.failed = false;
    this.confirmAccum = 0;
    this.contactLatched = false;
    this.impactVertical = 0;
    this.impactSpeed = 0;
    this.impactHorizontal = 0;
    this.impactTilt = 0;
    this.elapsedAtSuccess = 0;
    this.penalties = [];
    this.lastMessage = 'Approach the landing pad.';
  }

  private fail(
    id: string,
    label: string,
    amount: number,
    message: string,
  ): void {
    this.failed = true;
    this.penalties.push({ id, label, amount });
    this.lastMessage = message;
  }
}
