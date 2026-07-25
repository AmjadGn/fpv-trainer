import type { TrainingMedalThresholds } from '../../models/training-module.models';
import type {
  TrainingEvaluation,
  TrainingEvaluator,
  TrainingEvaluatorEvent,
  TrainingEvaluatorStartContext,
  TrainingPenalty,
  TrainingSessionSnapshot,
} from '../../models/training-session.models';

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
 * Event-driven gate course evaluator.
 * Expects: {type:'gate', payload:{gateIndex, centerAccuracy?}}, {type:'miss'}, {type:'finish'}, {type:'crash'}.
 */
export class GateCourseEvaluator implements TrainingEvaluator {
  private gateCount = 4;
  private thresholds: TrainingMedalThresholds = {
    bronze: 50,
    silver: 70,
    gold: 88,
  };
  private started = false;
  private completed = false;
  private nextExpected = 0;
  private gatesPassed = 0;
  private misses = 0;
  private crashes = 0;
  private centerAccuracySum = 0;
  private centerAccuracySamples = 0;
  private finishMs = 0;
  private lastElapsedMs = 0;
  private penalties: TrainingPenalty[] = [];
  private lastMessage = 'Pass the gates in order.';

  start(context: TrainingEvaluatorStartContext): void {
    this.reset();
    const raw = context.module.evaluatorConfig;
    this.thresholds = { ...context.module.medalThresholds };
    this.gateCount = Math.max(1, Math.floor(num(raw['gateCount'], 4)));
    this.started = true;
  }

  update(snapshot: TrainingSessionSnapshot): void {
    if (!this.started) {
      return;
    }
    if (Number.isFinite(snapshot.elapsedMs)) {
      this.lastElapsedMs = Math.max(0, snapshot.elapsedMs);
    }
    if (snapshot.crashed) {
      this.handleEvent({ type: 'crash' });
    }
  }

  handleEvent(event: TrainingEvaluatorEvent): void {
    if (!this.started || this.completed) {
      return;
    }

    if (event.type === 'miss') {
      this.misses += 1;
      this.penalties.push({
        id: `miss-${this.misses}`,
        label: 'Gate miss',
        amount: 6,
      });
      this.lastMessage = 'Miss — stay in the opening.';
      return;
    }

    if (event.type === 'crash') {
      this.crashes += 1;
      this.penalties.push({
        id: `crash-${this.crashes}`,
        label: 'Collision',
        amount: 10,
      });
      this.lastMessage = 'Collision recorded.';
      return;
    }

    if (event.type === 'gate') {
      const payload =
        event.payload && typeof event.payload === 'object'
          ? (event.payload as Record<string, unknown>)
          : {};
      const gateIndex = num(payload['gateIndex'], -1);
      if (gateIndex !== this.nextExpected) {
        this.misses += 1;
        this.penalties.push({
          id: `out-of-order-${this.misses}`,
          label: 'Out of sequence',
          amount: 8,
        });
        this.lastMessage = 'Wrong gate order.';
        return;
      }

      const accuracy = payload['centerAccuracy'];
      if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
        this.centerAccuracySum += clamp(accuracy, 0, 1);
        this.centerAccuracySamples += 1;
      }

      this.gatesPassed += 1;
      this.nextExpected += 1;
      this.lastMessage = `Gate ${this.gatesPassed}/${this.gateCount}`;
      return;
    }

    if (event.type === 'finish') {
      if (this.gatesPassed >= this.gateCount) {
        this.completed = true;
        this.finishMs = this.lastElapsedMs;
        this.lastMessage = 'Gate course complete.';
      } else {
        this.penalties.push({
          id: 'incomplete',
          label: 'Incomplete course',
          amount: 20,
        });
        this.lastMessage = 'Finish without all gates.';
      }
    }
  }

  isTerminal(): boolean {
    return this.completed;
  }

  finish(): TrainingEvaluation {
    const timeScore = this.completed
      ? clamp(100 - this.finishMs / 900, 20, 100)
      : clamp((this.gatesPassed / this.gateCount) * 55, 0, 55);
    const progressScore = clamp(
      (this.gatesPassed / this.gateCount) * 100,
      0,
      100,
    );
    const accuracy =
      this.centerAccuracySamples > 0
        ? (this.centerAccuracySum / this.centerAccuracySamples) * 100
        : 70;

    let score =
      progressScore * 0.4 + timeScore * 0.35 + accuracy * 0.25;
    if (!this.completed) {
      score = Math.min(score, 45);
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
        gatesPassed: this.gatesPassed,
        gateCount: this.gateCount,
        misses: this.misses,
        crashes: this.crashes,
        finishMs: Number.isFinite(this.finishMs) ? this.finishMs : 0,
        centerAccuracy:
          this.centerAccuracySamples > 0
            ? this.centerAccuracySum / this.centerAccuracySamples
            : 0,
      },
      penalties: [...this.penalties],
      message: this.lastMessage,
    };
  }

  reset(): void {
    this.started = false;
    this.completed = false;
    this.nextExpected = 0;
    this.gatesPassed = 0;
    this.misses = 0;
    this.crashes = 0;
    this.centerAccuracySum = 0;
    this.centerAccuracySamples = 0;
    this.finishMs = 0;
    this.lastElapsedMs = 0;
    this.penalties = [];
    this.lastMessage = 'Pass the gates in order.';
  }
}
