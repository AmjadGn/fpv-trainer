import { Injectable } from '@angular/core';

import type {
  TrainingEvaluatorType,
  TrainingMedal,
  TrainingMedalThresholds,
} from '../models/training-module.models';
import type { TrainingEvaluator } from '../models/training-session.models';
import { FigureEightEvaluator } from './evaluators/figure-eight.evaluator';
import { GateCourseEvaluator } from './evaluators/gate-course.evaluator';
import { HoverEvaluator } from './evaluators/hover.evaluator';
import { LandingEvaluator } from './evaluators/landing.evaluator';
import { CrosswindEvaluator } from './evaluators/crosswind.evaluator';

/**
 * Factory for pure training evaluators and shared medal mapping.
 */
@Injectable({ providedIn: 'root' })
export class TrainingEvaluatorService {
  createEvaluator(type: TrainingEvaluatorType): TrainingEvaluator {
    switch (type) {
      case 'hover':
        return new HoverEvaluator();
      case 'landing':
        return new LandingEvaluator();
      case 'gateCourse':
        return new GateCourseEvaluator();
      case 'figureEight':
        return new FigureEightEvaluator();
      case 'crosswind':
        return new CrosswindEvaluator();
      default: {
        const _exhaustive: never = type;
        throw new Error(`Unknown evaluator type: ${String(_exhaustive)}`);
      }
    }
  }

  medalFromScore(
    score: number,
    thresholds: TrainingMedalThresholds,
  ): TrainingMedal {
    const s = Number.isFinite(score) ? score : 0;
    if (s >= thresholds.gold) {
      return 'gold';
    }
    if (s >= thresholds.silver) {
      return 'silver';
    }
    if (s >= thresholds.bronze) {
      return 'bronze';
    }
    return 'none';
  }
}
