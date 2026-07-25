import { Injectable, inject, signal } from '@angular/core';

import {
  TRAINING_MODULES,
  getTrainingModuleById,
} from '../config/training-modules.config';
import type {
  TrainingModuleDefinition,
  TrainingResult,
} from '../models/training-module.models';
import type {
  TrainingEvaluation,
  TrainingEvaluator,
  TrainingEvaluatorEvent,
  TrainingSessionSnapshot,
  TrainingSessionState,
} from '../models/training-session.models';
import { TrainingEvaluatorService } from './training-evaluator.service';
import { TrainingProgressService } from './training-progress.service';

/**
 * Orchestrates Training Academy session state.
 * Does not control physics, camera, or rendering.
 */
@Injectable({ providedIn: 'root' })
export class TrainingAcademyService {
  private readonly evaluators = inject(TrainingEvaluatorService);
  private readonly progress = inject(TrainingProgressService);

  private evaluator: TrainingEvaluator | null = null;
  private recordedAttempt = false;
  private finished = false;

  private readonly stateSignal = signal<TrainingSessionState>('idle');
  private readonly activeModuleSignal =
    signal<TrainingModuleDefinition | null>(null);
  private readonly evaluationSignal = signal<TrainingEvaluation | null>(null);
  private readonly briefingVisibleSignal = signal(false);

  readonly state = this.stateSignal.asReadonly();
  readonly activeModule = this.activeModuleSignal.asReadonly();
  readonly evaluation = this.evaluationSignal.asReadonly();
  readonly briefingVisible = this.briefingVisibleSignal.asReadonly();

  openBriefing(moduleId: string): boolean {
    const module = getTrainingModuleById(moduleId);
    if (!module || !module.enabled) {
      return false;
    }
    if (!this.progress.isUnlocked(module)) {
      return false;
    }

    this.resetInternal(false);
    this.activeModuleSignal.set(module);
    this.stateSignal.set('briefing');
    this.briefingVisibleSignal.set(true);
    return true;
  }

  startPreparing(): void {
    const module = this.activeModuleSignal();
    if (!module) {
      return;
    }
    const state = this.stateSignal();
    if (state !== 'briefing' && state !== 'results' && state !== 'failed') {
      return;
    }

    this.briefingVisibleSignal.set(false);
    this.evaluationSignal.set(null);
    this.finished = false;
    this.recordedAttempt = false;
    this.evaluator = this.evaluators.createEvaluator(module.evaluatorType);
    this.evaluator.start({ module });
    this.stateSignal.set('preparing');
  }

  startCountdown(): void {
    if (this.stateSignal() !== 'preparing') {
      return;
    }
    this.stateSignal.set('countdown');
  }

  beginActive(): void {
    const module = this.activeModuleSignal();
    const state = this.stateSignal();
    if (!module || (state !== 'countdown' && state !== 'preparing')) {
      return;
    }
    if (!this.evaluator) {
      this.evaluator = this.evaluators.createEvaluator(module.evaluatorType);
      this.evaluator.start({ module });
    }
    if (!this.recordedAttempt) {
      this.progress.recordAttempt(module.id, module.version);
      this.recordedAttempt = true;
    }
    this.stateSignal.set('active');
  }

  pause(): void {
    if (this.stateSignal() !== 'active') {
      return;
    }
    this.stateSignal.set('paused');
  }

  resume(): void {
    if (this.stateSignal() !== 'paused') {
      return;
    }
    this.stateSignal.set('active');
  }

  update(snapshot: TrainingSessionSnapshot): void {
    if (this.stateSignal() !== 'active' || !this.evaluator || this.finished) {
      return;
    }
    this.evaluator.update(snapshot);
    this.maybeFinalizeFromEvaluator(snapshot.elapsedMs);
  }

  handleEvent(event: TrainingEvaluatorEvent): void {
    if (this.stateSignal() !== 'active' || !this.evaluator || this.finished) {
      return;
    }
    this.evaluator.handleEvent(event);
    if (event.type === 'finish') {
      const evaluation = this.finalizeEvaluation();
      if (evaluation.completed) {
        this.latchSuccess(evaluation, undefined);
      } else {
        this.latchFailure(evaluation);
      }
    }
  }

  completeSuccess(): void {
    if (this.finished) {
      return;
    }
    const evaluation = this.finalizeEvaluation();
    this.latchSuccess(evaluation, undefined);
  }

  completeFail(message?: string): void {
    if (this.finished) {
      return;
    }
    const evaluation = this.finalizeEvaluation();
    if (message) {
      evaluation.message = message;
    }
    this.latchFailure(evaluation);
  }

  retry(): void {
    const module = this.activeModuleSignal();
    if (!module) {
      return;
    }
    this.evaluationSignal.set(null);
    this.finished = false;
    this.recordedAttempt = false;
    this.evaluator = this.evaluators.createEvaluator(module.evaluatorType);
    this.evaluator.start({ module });
    this.briefingVisibleSignal.set(false);
    this.stateSignal.set('preparing');
  }

  nextModule(): boolean {
    const current = this.activeModuleSignal();
    if (!current) {
      return false;
    }
    const idx = TRAINING_MODULES.findIndex((m) => m.id === current.id);
    for (let i = idx + 1; i < TRAINING_MODULES.length; i++) {
      const candidate = TRAINING_MODULES[i];
      if (candidate.enabled && this.progress.isUnlocked(candidate)) {
        return this.openBriefing(candidate.id);
      }
    }
    this.returnToIdle();
    return false;
  }

  returnToIdle(): void {
    this.resetInternal(true);
  }

  reset(): void {
    this.resetInternal(true);
  }

  private latchSuccess(
    evaluation: TrainingEvaluation,
    elapsedMs: number | undefined,
  ): void {
    const module = this.activeModuleSignal();
    if (!module || this.finished) {
      return;
    }
    this.finished = true;

    const withMedal: TrainingEvaluation = {
      ...evaluation,
      completed: true,
      medal:
        evaluation.medal === 'none'
          ? this.evaluators.medalFromScore(
              evaluation.score,
              module.medalThresholds,
            )
          : evaluation.medal,
    };
    this.evaluationSignal.set(withMedal);
    this.stateSignal.set('success');
    this.persistResult(module, withMedal, elapsedMs, true);
    this.stateSignal.set('results');
  }

  private latchFailure(evaluation: TrainingEvaluation): void {
    const module = this.activeModuleSignal();
    if (!module || this.finished) {
      return;
    }
    this.finished = true;
    const failed: TrainingEvaluation = {
      ...evaluation,
      completed: false,
      medal: 'none',
    };
    this.evaluationSignal.set(failed);
    this.stateSignal.set('failed');
    this.persistResult(module, failed, undefined, false);
    this.stateSignal.set('results');
  }

  private maybeFinalizeFromEvaluator(elapsedMs: number): void {
    const evaluator = this.evaluator;
    if (!evaluator || this.finished) {
      return;
    }
    const terminal =
      'isTerminal' in evaluator &&
      typeof (evaluator as { isTerminal?: () => boolean }).isTerminal ===
        'function'
        ? (evaluator as { isTerminal: () => boolean }).isTerminal()
        : false;
    if (!terminal) {
      return;
    }
    const evaluation = evaluator.finish();
    if (evaluation.completed) {
      this.latchSuccess(evaluation, elapsedMs);
    } else {
      this.latchFailure(evaluation);
    }
  }

  private finalizeEvaluation(): TrainingEvaluation {
    if (!this.evaluator) {
      return {
        completed: false,
        score: 0,
        medal: 'none',
        metrics: {},
        penalties: [],
        message: 'No active evaluator.',
      };
    }
    return this.evaluator.finish();
  }

  private persistResult(
    module: TrainingModuleDefinition,
    evaluation: TrainingEvaluation,
    elapsedMs: number | undefined,
    completed: boolean,
  ): void {
    const durationMs =
      elapsedMs !== undefined && Number.isFinite(elapsedMs)
        ? elapsedMs
        : Number.isFinite(evaluation.metrics['finishMs'])
          ? evaluation.metrics['finishMs']
          : Number.isFinite(evaluation.metrics['durationMs'])
            ? evaluation.metrics['durationMs']
            : 0;
    const penalties = evaluation.penalties.reduce(
      (sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0),
      0,
    );
    const result: TrainingResult = {
      moduleId: module.id,
      moduleVersion: module.version,
      completed,
      score: Number.isFinite(evaluation.score) ? evaluation.score : 0,
      medal: evaluation.medal,
      durationMs,
      penalties,
      metrics: { ...evaluation.metrics },
      completedAt: new Date().toISOString(),
    };
    this.progress.recordCompletion(result);
  }

  private resetInternal(clearModule: boolean): void {
    this.evaluator?.reset();
    this.evaluator = null;
    this.recordedAttempt = false;
    this.finished = false;
    this.evaluationSignal.set(null);
    this.briefingVisibleSignal.set(false);
    this.stateSignal.set('idle');
    if (clearModule) {
      this.activeModuleSignal.set(null);
    }
  }
}
