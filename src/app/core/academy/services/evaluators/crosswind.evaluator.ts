import type { TrainingMedalThresholds } from '../../models/training-module.models';
import type {
  TrainingEvaluation,
  TrainingEvaluator,
  TrainingEvaluatorEvent,
  TrainingEvaluatorStartContext,
  TrainingPenalty,
  TrainingSessionSnapshot,
} from '../../models/training-session.models';
import {
  detectGateCrossing,
  isInsideGateTrigger,
} from '../../../course/utils/gate-crossing';
import type { CourseGate } from '../../../course/models/course.model';
import { quatFromYaw } from '../../../course/models/course.model';

interface CrosswindConfig {
  hoverCenter: { x: number; y: number; z: number };
  hoverRadius: number;
  hoverHoldSeconds: number;
  gateCount: number;
  gates: CourseGate[];
  padCenter: { x: number; y: number; z: number };
  padRadius: number;
  crashPenalty: number;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function medalFromScore(
  score: number,
  thresholds: TrainingMedalThresholds,
): TrainingEvaluation['medal'] {
  if (score >= thresholds.gold) return 'gold';
  if (score >= thresholds.silver) return 'silver';
  if (score >= thresholds.bronze) return 'bronze';
  return 'none';
}

function defaultGates(): CourseGate[] {
  return [0, 1, 2].map((i) => ({
    id: `cw-${i}`,
    index: i,
    position: { x: 0, y: 1.85, z: -10 - i * 12 },
    rotation: quatFromYaw(0),
    width: 4,
    height: 3,
    depth: 0.45,
    triggerPadding: 0.4,
  }));
}

/**
 * Crosswind Fundamentals: hover under lateral wind, fly three gates, land.
 * Wind is applied by flight physics — this evaluator scores outcomes only.
 */
export class CrosswindEvaluator implements TrainingEvaluator {
  private config: CrosswindConfig = {
    hoverCenter: { x: 0, y: 3, z: -8 },
    hoverRadius: 1.5,
    hoverHoldSeconds: 8,
    gateCount: 3,
    gates: defaultGates(),
    padCenter: { x: 0, y: 0, z: -48 },
    padRadius: 1.8,
    crashPenalty: 12,
  };
  private thresholds: TrainingMedalThresholds = {
    bronze: 50,
    silver: 70,
    gold: 88,
  };

  private phase: 'hover' | 'gates' | 'landing' | 'done' = 'hover';
  private hoverSeconds = 0;
  private gatesCompleted = 0;
  private gateIndex = 0;
  private gateLatch = false;
  private landed = false;
  private landConfirm = 0;
  private sumLateral = 0;
  private lateralSamples = 0;
  private crashes = 0;
  private penalties: TrainingPenalty[] = [];
  private started = false;
  private completed = false;
  private lastMessage = 'Hover in the target while compensating for wind.';
  private prevPos = { x: 0, y: 0, z: 0 };

  start(context: TrainingEvaluatorStartContext): void {
    this.reset();
    const raw = context.module.evaluatorConfig;
    this.thresholds = { ...context.module.medalThresholds };
    const hoverRaw = raw['hoverCenter'];
    const hover =
      hoverRaw && typeof hoverRaw === 'object'
        ? (hoverRaw as Record<string, unknown>)
        : {};
    const padRaw = raw['padCenter'];
    const pad =
      padRaw && typeof padRaw === 'object'
        ? (padRaw as Record<string, unknown>)
        : {};
    this.config = {
      hoverCenter: {
        x: num(hover['x'], 0),
        y: num(hover['y'], 3),
        z: num(hover['z'], -8),
      },
      hoverRadius: num(raw['hoverRadius'], 1.5),
      hoverHoldSeconds: num(raw['hoverHoldSeconds'], 8),
      gateCount: num(raw['gateCount'], 3),
      gates: defaultGates(),
      padCenter: {
        x: num(pad['x'], 0),
        y: num(pad['y'], 0),
        z: num(pad['z'], -48),
      },
      padRadius: num(raw['padRadius'], 1.8),
      crashPenalty: num(raw['crashPenalty'], 12),
    };
    this.started = true;
    this.lastMessage = 'Take off and hover in the glowing zone.';
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

    const pos = snapshot.position;

    if (snapshot.crashed) {
      this.crashes += 1;
      this.penalties.push({
        id: `crash-${this.crashes}`,
        label: 'Crash',
        amount: this.config.crashPenalty,
      });
      this.lastMessage = 'Crashed — reset and continue when ready.';
      this.prevPos = { x: pos.x, y: pos.y, z: pos.z };
      return;
    }

    const lateral = Math.abs(pos.x - this.config.hoverCenter.x);
    this.sumLateral += lateral;
    this.lateralSamples += 1;

    if (this.phase === 'hover') {
      const dx = pos.x - this.config.hoverCenter.x;
      const dz = pos.z - this.config.hoverCenter.z;
      const dy = pos.y - this.config.hoverCenter.y;
      const inside =
        Math.hypot(dx, dz) <= this.config.hoverRadius && Math.abs(dy) < 1.4;
      if (inside && snapshot.armed) {
        this.hoverSeconds += dt;
        this.lastMessage = `Hover hold ${this.hoverSeconds.toFixed(1)}s / ${this.config.hoverHoldSeconds}s`;
        if (this.hoverSeconds >= this.config.hoverHoldSeconds) {
          this.phase = 'gates';
          this.lastMessage = 'Fly the three aligned gates — fight the drift.';
        }
      }
    } else if (this.phase === 'gates') {
      const gate = this.config.gates[this.gateIndex];
      if (gate) {
        const inside = isInsideGateTrigger(gate, pos);
        if (this.gateLatch) {
          if (!inside) {
            this.gateLatch = false;
          }
        } else {
          const result = detectGateCrossing(gate, this.prevPos, pos);
          if (result.type === 'valid') {
            this.gateLatch = true;
            this.gatesCompleted += 1;
            this.gateIndex += 1;
            if (this.gatesCompleted >= this.config.gateCount) {
              this.phase = 'landing';
              this.lastMessage = 'Land on the target pad ahead.';
            } else {
              this.lastMessage = `Next gate ${this.gateIndex + 1}`;
            }
          }
        }
      }
    } else if (this.phase === 'landing') {
      const pad = this.config.padCenter;
      const dist = Math.hypot(pos.x - pad.x, pos.z - pad.z);
      const onPad = dist <= this.config.padRadius && pos.y < 0.35;
      const speed = Math.hypot(
        snapshot.velocity.x,
        snapshot.velocity.y,
        snapshot.velocity.z,
      );
      if (onPad && speed < 1.5) {
        this.landConfirm += dt;
        if (this.landConfirm >= 0.5) {
          this.landed = true;
          this.phase = 'done';
          this.completed = true;
          this.lastMessage = 'Crosswind drill complete.';
        }
      } else {
        this.landConfirm = 0;
      }
    }

    this.prevPos = { x: pos.x, y: pos.y, z: pos.z };
  }

  handleEvent(_event: TrainingEvaluatorEvent): void {
    // Snapshot-driven.
  }

  finish(): TrainingEvaluation {
    const avgLateral =
      this.lateralSamples > 0 ? this.sumLateral / this.lateralSamples : 99;
    const hoverScore = Math.min(
      35,
      (this.hoverSeconds / Math.max(0.1, this.config.hoverHoldSeconds)) * 35,
    );
    const gateScore =
      (this.gatesCompleted / Math.max(1, this.config.gateCount)) * 35;
    const landScore = this.landed ? 25 : 0;
    const driftPenalty = Math.min(20, Math.max(0, avgLateral - 1) * 4);
    const crashPen = this.penalties.reduce((s, p) => s + p.amount, 0);
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(hoverScore + gateScore + landScore - driftPenalty - crashPen),
      ),
    );
    return {
      completed: this.completed,
      score,
      medal: medalFromScore(score, this.thresholds),
      message: this.lastMessage,
      metrics: {
        hoverSeconds: this.hoverSeconds,
        gatesCompleted: this.gatesCompleted,
        avgLateralDrift: avgLateral,
        landed: this.landed ? 1 : 0,
        crashes: this.crashes,
      },
      penalties: [...this.penalties],
    };
  }

  reset(): void {
    this.phase = 'hover';
    this.hoverSeconds = 0;
    this.gatesCompleted = 0;
    this.gateIndex = 0;
    this.gateLatch = false;
    this.landed = false;
    this.landConfirm = 0;
    this.sumLateral = 0;
    this.lateralSamples = 0;
    this.crashes = 0;
    this.penalties = [];
    this.started = false;
    this.completed = false;
    this.lastMessage = 'Hover in the target while compensating for wind.';
    this.prevPos = { x: 0, y: 0, z: 0 };
  }
}
