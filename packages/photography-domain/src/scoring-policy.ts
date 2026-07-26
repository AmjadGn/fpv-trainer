/**
 * `PhotographyScoringPolicy` — versioned, data-only description of how a
 * `PhotoCaptureEvidence` is turned into a `PhotoEvaluationResult` by
 * `evaluatePhotoCapture` (see `scoring.ts` for the determinism policy this
 * supports).
 */

import type { FeedbackCode } from './feedback-codes';

export const SCORING_POLICY_VERSION = '1.0.0';

/**
 * Fixed component order used everywhere a scoring result is aggregated or
 * serialized. Determinism policy: components are always summed/serialized
 * in this exact order, regardless of the order any intermediate map/set
 * happened to produce values in.
 */
export const SCORING_COMPONENT_ORDER = [
  'visibility',
  'framing',
  'centering',
  'coverage',
  'distance',
  'viewingAngle',
  'altitude',
  'positionZone',
  'lineOfSight',
  'stability',
  'bonus',
] as const;

export type ScoringComponentId = (typeof SCORING_COMPONENT_ORDER)[number];

export interface ScoringComponentWeight {
  readonly componentId: ScoringComponentId;
  /** Integer points awarded when this component is fully satisfied. */
  readonly maxScore: number;
}

export interface PhotographyScoringPolicy {
  readonly policyVersion: string;
  /** Exactly one entry per id in `SCORING_COMPONENT_ORDER`. */
  readonly components: readonly ScoringComponentWeight[];
  /**
   * Quantization scale applied to raw evidence numbers before scoring
   * (see `scoring.ts` `quantize`). Default policy uses `1e6`.
   */
  readonly quantizationScale: number;
  /** Stable priority order used to pick which feedback codes surface first when several apply. */
  readonly hardFailureFeedbackPriority: readonly FeedbackCode[];
}

function componentWeight(componentId: ScoringComponentId, maxScore: number): ScoringComponentWeight {
  return { componentId, maxScore };
}

/**
 * The default photography scoring policy. Total max score is 120 points
 * across all components (visibility 20, framing 10, centering 10,
 * coverage 10, distance 10, viewingAngle 10, altitude 5, positionZone 5,
 * lineOfSight 10, stability 10, bonus 10).
 */
export function createDefaultPhotographyScoringPolicy(): PhotographyScoringPolicy {
  return {
    policyVersion: SCORING_POLICY_VERSION,
    components: [
      componentWeight('visibility', 20),
      componentWeight('framing', 10),
      componentWeight('centering', 10),
      componentWeight('coverage', 10),
      componentWeight('distance', 10),
      componentWeight('viewingAngle', 10),
      componentWeight('altitude', 5),
      componentWeight('positionZone', 5),
      componentWeight('lineOfSight', 10),
      componentWeight('stability', 10),
      componentWeight('bonus', 10),
    ],
    quantizationScale: 1_000_000,
    hardFailureFeedbackPriority: [
      'SUBJECT_NOT_VISIBLE',
      'WRONG_VIEWING_SIDE',
      'VIEW_OBSTRUCTED',
      'TOO_LOW',
      'TOO_HIGH',
      'MOVE_CLOSER',
      'MOVE_FARTHER',
      'HOLD_STEADY',
    ],
  };
}
