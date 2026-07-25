import type { TrainingMedalThresholds } from '../../models/training-module.models';
import type {
  TrainingEvaluation,
  TrainingEvaluator,
  TrainingEvaluatorEvent,
  TrainingEvaluatorStartContext,
  TrainingPenalty,
  TrainingSessionSnapshot,
} from '../../models/training-session.models';

type CheckpointId = 'center' | 'left' | 'right';

interface FigureEightConfig {
  center: { x: number; y: number; z: number };
  leftMarker: { x: number; y: number; z: number };
  rightMarker: { x: number; y: number; z: number };
  checkpointRadius: number;
  requiredCycles: number;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function vec3(
  raw: unknown,
  fallback: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  if (!raw || typeof raw !== 'object') {
    return { ...fallback };
  }
  const o = raw as Record<string, unknown>;
  return {
    x: num(o['x'], fallback.x),
    y: num(o['y'], fallback.y),
    z: num(o['z'], fallback.z),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function distance3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  const d = Math.hypot(
    Number.isFinite(dx) ? dx : 0,
    Number.isFinite(dy) ? dy : 0,
    Number.isFinite(dz) ? dz : 0,
  );
  return Number.isFinite(d) ? d : Number.POSITIVE_INFINITY;
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
 * Sequence: center → left → center → right → (repeat) for requiredCycles.
 */
export class FigureEightEvaluator implements TrainingEvaluator {
  private config: FigureEightConfig = {
    center: { x: 0, y: 2, z: -30 },
    leftMarker: { x: -8, y: 2, z: -30 },
    rightMarker: { x: 8, y: 2, z: -30 },
    checkpointRadius: 3,
    requiredCycles: 2,
  };
  private thresholds: TrainingMedalThresholds = {
    bronze: 55,
    silver: 72,
    gold: 90,
  };
  private started = false;
  private completed = false;
  /** Index into the repeating sequence pattern. */
  private sequenceIndex = 0;
  private cyclesCompleted = 0;
  private wrongOrderCount = 0;
  private crashes = 0;
  private speedSamples = 0;
  private speedSum = 0;
  private speedSumSq = 0;
  private finishMs = 0;
  private lastInside: CheckpointId | null = null;
  private penalties: TrainingPenalty[] = [];
  private lastMessage = 'Acquire the center checkpoint.';

  private readonly pattern: CheckpointId[] = [
    'center',
    'left',
    'center',
    'right',
  ];

  start(context: TrainingEvaluatorStartContext): void {
    this.reset();
    const raw = context.module.evaluatorConfig;
    this.thresholds = { ...context.module.medalThresholds };
    this.config = {
      center: vec3(raw['center'], this.config.center),
      leftMarker: vec3(raw['leftMarker'], this.config.leftMarker),
      rightMarker: vec3(raw['rightMarker'], this.config.rightMarker),
      checkpointRadius: num(raw['checkpointRadius'], 3),
      requiredCycles: Math.max(1, Math.floor(num(raw['requiredCycles'], 2))),
    };
    this.started = true;
  }

  update(snapshot: TrainingSessionSnapshot): void {
    if (!this.started || this.completed) {
      return;
    }

    if (snapshot.crashed) {
      this.crashes += 1;
      this.penalties.push({
        id: `crash-${this.crashes}`,
        label: 'Crash',
        amount: 12,
      });
      this.lastMessage = 'Crash — continue the sequence.';
      return;
    }

    const speed = Number.isFinite(snapshot.speed) ? snapshot.speed : 0;
    this.speedSamples += 1;
    this.speedSum += speed;
    this.speedSumSq += speed * speed;

    const hit = this.nearestCheckpoint(snapshot.position);
    if (!hit) {
      this.lastInside = null;
      return;
    }

    // Edge trigger: only process on enter.
    if (hit === this.lastInside) {
      return;
    }
    this.lastInside = hit;

    const expected = this.pattern[this.sequenceIndex % this.pattern.length];
    if (hit !== expected) {
      this.wrongOrderCount += 1;
      this.penalties.push({
        id: `wrong-order-${this.wrongOrderCount}`,
        label: 'Wrong checkpoint order',
        amount: 4,
      });
      // Soft reset to last valid: stay on current expected (do not advance).
      this.lastMessage = `Need ${expected} next.`;
      return;
    }

    this.sequenceIndex += 1;
    if (this.sequenceIndex % this.pattern.length === 0) {
      this.cyclesCompleted += 1;
      this.lastMessage = `Cycle ${this.cyclesCompleted}/${this.config.requiredCycles}`;
      if (this.cyclesCompleted >= this.config.requiredCycles) {
        this.completed = true;
        this.finishMs = Number.isFinite(snapshot.elapsedMs)
          ? Math.max(0, snapshot.elapsedMs)
          : 0;
        this.lastMessage = 'Figure eight complete.';
      }
    } else {
      const next = this.pattern[this.sequenceIndex % this.pattern.length];
      this.lastMessage = `Next: ${next}`;
    }
  }

  handleEvent(_event: TrainingEvaluatorEvent): void {
    // Figure-eight is snapshot/proximity driven.
  }

  isTerminal(): boolean {
    return this.completed;
  }

  finish(): TrainingEvaluation {
    const progress = clamp(
      this.cyclesCompleted / this.config.requiredCycles,
      0,
      1,
    );
    const sequenceValidity = clamp(
      100 - this.wrongOrderCount * 8,
      0,
      100,
    );
    const mean =
      this.speedSamples > 0 ? this.speedSum / this.speedSamples : 0;
    const variance =
      this.speedSamples > 1
        ? Math.max(0, this.speedSumSq / this.speedSamples - mean * mean)
        : 0;
    const smoothness = clamp(100 - Math.sqrt(variance) * 12, 0, 100);
    const timeScore = this.completed
      ? clamp(100 - this.finishMs / 1200, 20, 100)
      : progress * 50;

    let score =
      progress * 100 * 0.4 +
      sequenceValidity * 0.25 +
      smoothness * 0.2 +
      timeScore * 0.15;
    if (!this.completed) {
      score = Math.min(score, 48);
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
        cyclesCompleted: this.cyclesCompleted,
        requiredCycles: this.config.requiredCycles,
        wrongOrderCount: this.wrongOrderCount,
        crashes: this.crashes,
        speedVariance: Number.isFinite(variance) ? variance : 0,
        finishMs: Number.isFinite(this.finishMs) ? this.finishMs : 0,
      },
      penalties: [...this.penalties],
      message: this.lastMessage,
    };
  }

  reset(): void {
    this.started = false;
    this.completed = false;
    this.sequenceIndex = 0;
    this.cyclesCompleted = 0;
    this.wrongOrderCount = 0;
    this.crashes = 0;
    this.speedSamples = 0;
    this.speedSum = 0;
    this.speedSumSq = 0;
    this.finishMs = 0;
    this.lastInside = null;
    this.penalties = [];
    this.lastMessage = 'Acquire the center checkpoint.';
  }

  private nearestCheckpoint(
    position: { x: number; y: number; z: number },
  ): CheckpointId | null {
    const r = this.config.checkpointRadius;
    const candidates: Array<{ id: CheckpointId; d: number }> = [
      { id: 'center', d: distance3(position, this.config.center) },
      { id: 'left', d: distance3(position, this.config.leftMarker) },
      { id: 'right', d: distance3(position, this.config.rightMarker) },
    ];
    let best: { id: CheckpointId; d: number } | null = null;
    for (const c of candidates) {
      if (!(c.d <= r)) {
        continue;
      }
      if (!best || c.d < best.d) {
        best = c;
      }
    }
    return best?.id ?? null;
  }
}
