import type { TrainingMedalThresholds } from '../../models/training-module.models';
import type {
  TrainingEvaluation,
  TrainingEvaluator,
  TrainingEvaluatorEvent,
  TrainingEvaluatorStartContext,
  TrainingPenalty,
  TrainingSessionSnapshot,
} from '../../models/training-session.models';

interface HoverConfig {
  holdSeconds: number;
  radius: number;
  targetHeight: number;
  center: { x: number; y: number; z: number };
  briefExitGraceSeconds: number;
  crashPenalty: number;
  verticalTolerance: number;
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

/**
 * Pure hover evaluator: accumulate hold time inside a cylindrical target zone.
 */
export class HoverEvaluator implements TrainingEvaluator {
  private config: HoverConfig = {
    holdSeconds: 20,
    radius: 1.2,
    targetHeight: 3,
    center: { x: 0, y: 3, z: -12 },
    briefExitGraceSeconds: 1.5,
    crashPenalty: 15,
    verticalTolerance: 1,
  };
  private thresholds: TrainingMedalThresholds = {
    bronze: 50,
    silver: 70,
    gold: 88,
  };
  private insideSeconds = 0;
  private outsideSeconds = 0;
  private errorSamples = 0;
  private sumHorizontalError = 0;
  private sumVerticalError = 0;
  private maxDrift = 0;
  private acquisitionMs: number | null = null;
  private started = false;
  private completed = false;
  private crashedOnce = false;
  private penalties: TrainingPenalty[] = [];
  private lastMessage = 'Hold inside the target cylinder.';

  start(context: TrainingEvaluatorStartContext): void {
    this.reset();
    const raw = context.module.evaluatorConfig;
    this.thresholds = { ...context.module.medalThresholds };
    const centerRaw = raw['center'];
    const center =
      centerRaw && typeof centerRaw === 'object'
        ? (centerRaw as Record<string, unknown>)
        : {};
    this.config = {
      holdSeconds: num(raw['holdSeconds'], 20),
      radius: num(raw['radius'], 1.2),
      targetHeight: num(raw['targetHeight'], 3),
      center: {
        x: num(center['x'], 0),
        y: num(center['y'], 3),
        z: num(center['z'], -12),
      },
      briefExitGraceSeconds: num(raw['briefExitGraceSeconds'], 1.5),
      crashPenalty: num(raw['crashPenalty'], 15),
      verticalTolerance: num(raw['verticalTolerance'], 1),
    };
    this.started = true;
  }

  update(snapshot: TrainingSessionSnapshot): void {
    if (!this.started || this.completed) {
      return;
    }

    const dt = Number.isFinite(snapshot.deltaSeconds)
      ? Math.max(0, snapshot.deltaSeconds)
      : 0;
    if (dt <= 0) {
      return;
    }

    if (snapshot.crashed) {
      this.onCrash();
      return;
    }

    const dx = snapshot.position.x - this.config.center.x;
    const dz = snapshot.position.z - this.config.center.z;
    const horizontal = Math.hypot(
      Number.isFinite(dx) ? dx : 0,
      Number.isFinite(dz) ? dz : 0,
    );
    const verticalError = Math.abs(
      (Number.isFinite(snapshot.altitude)
        ? snapshot.altitude
        : snapshot.position.y) - this.config.targetHeight,
    );
    const inside =
      horizontal <= this.config.radius &&
      verticalError <= this.config.verticalTolerance;

    this.errorSamples += 1;
    this.sumHorizontalError += horizontal;
    this.sumVerticalError += Number.isFinite(verticalError) ? verticalError : 0;
    this.maxDrift = Math.max(this.maxDrift, horizontal);

    if (inside) {
      if (this.acquisitionMs === null && Number.isFinite(snapshot.elapsedMs)) {
        this.acquisitionMs = Math.max(0, snapshot.elapsedMs);
      }
      this.outsideSeconds = 0;
      this.insideSeconds += dt;
      this.lastMessage = 'Holding — stay centered.';
      if (this.insideSeconds >= this.config.holdSeconds) {
        this.completed = true;
        this.insideSeconds = this.config.holdSeconds;
        this.lastMessage = 'Hover hold complete.';
      }
      return;
    }

    this.outsideSeconds += dt;
    if (this.outsideSeconds <= this.config.briefExitGraceSeconds) {
      // Brief exits bleed progress slowly instead of hard-failing.
      const bleed = dt * 0.35;
      this.insideSeconds = Math.max(0, this.insideSeconds - bleed);
      this.lastMessage = 'Brief exit — ease back into the zone.';
    } else {
      const bleed = dt * 0.75;
      this.insideSeconds = Math.max(0, this.insideSeconds - bleed);
      this.lastMessage = 'Outside zone — progress draining.';
    }
  }

  handleEvent(_event: TrainingEvaluatorEvent): void {
    // Hover evaluator is snapshot-driven.
  }

  isTerminal(): boolean {
    return this.completed;
  }

  finish(): TrainingEvaluation {
    const avgHorizontal =
      this.errorSamples > 0 ? this.sumHorizontalError / this.errorSamples : 0;
    const avgVertical =
      this.errorSamples > 0 ? this.sumVerticalError / this.errorSamples : 0;
    const accuracy = clamp(
      100 -
        avgHorizontal * 28 -
        avgVertical * 18 -
        Math.max(0, this.maxDrift - this.config.radius) * 12,
      0,
      100,
    );
    const stability = clamp(100 - this.maxDrift * 22, 0, 100);
    const acquisitionBonus =
      this.acquisitionMs !== null
        ? clamp(100 - this.acquisitionMs / 80, 20, 100)
        : 40;
    const holdRatio = clamp(
      this.insideSeconds / Math.max(0.001, this.config.holdSeconds),
      0,
      1,
    );

    let score =
      accuracy * 0.35 +
      stability * 0.25 +
      acquisitionBonus * 0.15 +
      holdRatio * 100 * 0.25;
    const penaltyTotal = this.penalties.reduce((sum, p) => sum + p.amount, 0);
    score = clamp(score - penaltyTotal, 0, 100);

    const metrics: Record<string, number> = {
      holdSeconds: this.finite(this.insideSeconds),
      avgHorizontalError: this.finite(avgHorizontal),
      avgVerticalError: this.finite(avgVertical),
      maxDrift: this.finite(this.maxDrift),
      acquisitionMs: this.finite(this.acquisitionMs ?? -1),
      crashCount: this.crashedOnce ? 1 : 0,
    };

    return {
      completed: this.completed,
      score: this.finite(score),
      medal: this.completed
        ? medalFromScore(score, this.thresholds)
        : 'none',
      metrics,
      penalties: [...this.penalties],
      message: this.lastMessage,
    };
  }

  reset(): void {
    this.insideSeconds = 0;
    this.outsideSeconds = 0;
    this.errorSamples = 0;
    this.sumHorizontalError = 0;
    this.sumVerticalError = 0;
    this.maxDrift = 0;
    this.acquisitionMs = null;
    this.started = false;
    this.completed = false;
    this.crashedOnce = false;
    this.penalties = [];
    this.lastMessage = 'Hold inside the target cylinder.';
  }

  private onCrash(): void {
    this.insideSeconds = 0;
    this.outsideSeconds = 0;
    if (!this.crashedOnce) {
      this.crashedOnce = true;
      this.penalties.push({
        id: 'crash',
        label: 'Crash',
        amount: this.config.crashPenalty,
      });
    }
    this.lastMessage = 'Crash — hold streak reset.';
  }

  private finite(value: number): number {
    return Number.isFinite(value) ? value : 0;
  }
}
