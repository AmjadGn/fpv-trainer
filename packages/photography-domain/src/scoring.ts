/**
 * `evaluatePhotoCapture` — turns a `PhotoCaptureEvidence` + a
 * `PhotographyObjectiveDefinition` + a `PhotographyScoringPolicy` into a
 * `PhotoEvaluationResult`.
 *
 * DETERMINISM POLICY (read before modifying this file):
 *
 * 1. Every raw numeric evidence/objective input used in a comparison or a
 *    score computation is passed through `quantize(value, scale)` first
 *    (`scale` = `policy.quantizationScale`, default `1e6`). This removes
 *    floating-point jitter from upstream computation paths so structurally
 *    identical captures always compare/score identically, and so
 *    threshold checks (`>=`, `<=`) never flap on sub-ULP noise.
 * 2. Every component score is an integer in `[0, componentMaxScore]`,
 *    produced via `Math.round(...)` — never a raw float.
 * 3. Components are aggregated (summed) and serialized in the fixed order
 *    `SCORING_COMPONENT_ORDER` from `scoring-policy.ts`, not in whatever
 *    order they happened to be computed.
 * 4. Subjects are processed in ordinal string order of `subjectId`
 *    (`compareOrdinal`, not `localeCompare` — ordinal comparison avoids
 *    ICU/locale-dependent ordering differences across JS engines/builds),
 *    not in whatever order `evidence.subjectObservations` happened to be
 *    passed in.
 * 5. No `Date.now`, `Math.random`, `performance.now`, or other
 *    non-deterministic source is read anywhere in this module. Given
 *    identical `(evidence, objective, policy)` inputs, `evaluatePhotoCapture`
 *    always returns a deeply structurally identical result — in particular
 *    `JSON.stringify(result)` is byte-identical across any number of calls,
 *    processes, or machines (see `scoring.spec.ts`, which asserts this
 *    across 200+ repeated calls for every golden scenario).
 *
 * This function does not throw: structurally-odd inputs degrade to hard
 * failures / zeroed components rather than exceptions, so it stays safe to
 * call from a fixed-step evaluation loop.
 */

import type { Vec3 } from '@fpv/simulation-contracts';
import { evaluateAltitudeRange, evaluateSpeedThresholds } from './projection';
import type { PhotoCaptureEvidence, SubjectObservation } from './evidence';
import type { BonusCondition, NumericRange, PhotographyObjectiveDefinition } from './objective';
import {
  SCORING_COMPONENT_ORDER,
  createDefaultPhotographyScoringPolicy,
  type PhotographyScoringPolicy,
  type ScoringComponentId,
} from './scoring-policy';
import type { FeedbackCode } from './feedback-codes';

export type { FeedbackCode } from './feedback-codes';
export { FEEDBACK_CODES, isKnownFeedbackCode } from './feedback-codes';

// ---------------------------------------------------------------------------
// Small deterministic-math helpers
// ---------------------------------------------------------------------------

/** Rounds `value` to the nearest multiple of `1/scale` (default policy: `scale = 1e6`). */
export function quantize(value: number, scale: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  return Math.round(value * scale) / scale;
}

/** Ordinal (byte-value) string comparison — deliberately not `localeCompare`. See module doc, policy item 4. */
function compareOrdinal(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function vecLength(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface PhotoScoreComponent {
  readonly componentId: ScoringComponentId;
  readonly rawScore: number;
  readonly maxScore: number;
}

export interface PhotoEvaluationResult {
  readonly scoringPolicyVersion: string;
  readonly passed: boolean;
  readonly totalScore: number;
  readonly maxScore: number;
  /** `totalScore / maxScore`, quantized via `quantize(..., policy.quantizationScale)`. */
  readonly normalizedScore: number;
  /** Always in `SCORING_COMPONENT_ORDER` order — see determinism policy item 3. */
  readonly components: readonly PhotoScoreComponent[];
  readonly hardFailureReasons: readonly string[];
  readonly feedbackCodes: readonly FeedbackCode[];
  readonly diagnostics?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Range-metric scoring (shared by coverage / distance / viewingAngle)
// ---------------------------------------------------------------------------

interface RangeScoreResult {
  readonly closeness: number; // 0..1, 1 = fully within range
  readonly direction: 'below' | 'above' | 'within' | 'unknown';
}

/**
 * Scores a metric against an inclusive `[min, max]` range. Values inside
 * the range score `1`. Values outside fall off linearly relative to the
 * range width, reaching `0` once the overshoot equals the range width.
 */
function scoreRangeMetric(value: number | null, range: NumericRange, q: (n: number) => number): RangeScoreResult {
  if (value === null) {
    return { closeness: 0, direction: 'unknown' };
  }
  const min = q(range.min);
  const max = q(range.max);
  const v = q(value);
  if (v >= min && v <= max) {
    return { closeness: 1, direction: 'within' };
  }
  const width = Math.max(max - min, 1e-9);
  if (v < min) {
    return { closeness: clamp01(1 - (min - v) / width), direction: 'below' };
  }
  return { closeness: clamp01(1 - (v - max) / width), direction: 'above' };
}

// ---------------------------------------------------------------------------
// Hard-failure category order (fixed, for deterministic `hardFailureReasons`)
// ---------------------------------------------------------------------------

type HardFailureCategory =
  | 'crashed'
  | 'camera'
  | 'subjectVisibility'
  | 'viewingSide'
  | 'distance'
  | 'altitude'
  | 'positionZone'
  | 'lineOfSight'
  | 'stability';

const HARD_FAILURE_CATEGORY_ORDER: readonly HardFailureCategory[] = [
  'crashed',
  'camera',
  'subjectVisibility',
  'viewingSide',
  'distance',
  'altitude',
  'positionZone',
  'lineOfSight',
  'stability',
];

// ---------------------------------------------------------------------------
// Bonus conditions
// ---------------------------------------------------------------------------

interface BonusEvalContext {
  readonly avgCoverage: number | null;
  readonly avgCenteringError: number | null;
  readonly avgDistance: number | null;
  readonly distanceRange: NumericRange;
  readonly stableTicks: number;
  readonly framingScore: number;
  readonly framingMaxScore: number;
  readonly centeringScore: number;
  readonly centeringMaxScore: number;
  readonly coverageScore: number;
  readonly coverageMaxScore: number;
}

function evaluateBonusCondition(condition: BonusCondition, ctx: BonusEvalContext, q: (n: number) => number): boolean {
  switch (condition.kind) {
    case 'coverage-above':
      return ctx.avgCoverage !== null && q(ctx.avgCoverage) >= q(condition.thresholdValue);
    case 'centering-below':
      return ctx.avgCenteringError !== null && q(ctx.avgCenteringError) <= q(condition.thresholdValue);
    case 'distance-within-tolerance-of-midpoint': {
      if (ctx.avgDistance === null) {
        return false;
      }
      const midpoint = (ctx.distanceRange.min + ctx.distanceRange.max) / 2;
      return Math.abs(q(ctx.avgDistance) - q(midpoint)) <= q(condition.thresholdValue);
    }
    case 'stability-duration-above':
      return ctx.stableTicks >= q(condition.thresholdValue);
    case 'composite-excellent-framing':
      return (
        ctx.framingScore === ctx.framingMaxScore &&
        ctx.centeringScore === ctx.centeringMaxScore &&
        ctx.coverageScore === ctx.coverageMaxScore
      );
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// evaluatePhotoCapture
// ---------------------------------------------------------------------------

export function evaluatePhotoCapture(
  evidence: PhotoCaptureEvidence,
  objective: PhotographyObjectiveDefinition,
  policy: PhotographyScoringPolicy = createDefaultPhotographyScoringPolicy(),
): PhotoEvaluationResult {
  const scale = policy.quantizationScale > 0 ? policy.quantizationScale : 1_000_000;
  const q = (value: number): number => quantize(value, scale);

  function maxScoreFor(id: ScoringComponentId): number {
    const found = policy.components.find((c) => c.componentId === id);
    return found ? found.maxScore : 0;
  }

  // --- stable subject ordering (determinism policy item 4) ---
  const observationById = new Map<string, SubjectObservation>();
  for (const observation of evidence.subjectObservations) {
    observationById.set(observation.subjectId as unknown as string, observation);
  }
  const requiredSubjectIds = objective.requiredSubjectIds.map((id) => id as unknown as string).slice().sort(compareOrdinal);
  const primarySubjectIds = objective.primarySubjectIds.map((id) => id as unknown as string).slice().sort(compareOrdinal);

  function isSubjectSatisfied(id: string): boolean {
    const obs = observationById.get(id);
    return !!obs && obs.visible && q(obs.visibilityRatio) >= q(objective.visibilityMin);
  }

  const satisfiedRequiredIds = requiredSubjectIds.filter(isSubjectSatisfied);
  const allPrimarySatisfied = primarySubjectIds.length === 0 || primarySubjectIds.every(isSubjectSatisfied);

  const primaryObservations: SubjectObservation[] = primarySubjectIds
    .filter(isSubjectSatisfied)
    .map((id) => observationById.get(id))
    .filter((observation): observation is SubjectObservation => observation !== undefined);

  // --- hard-failure detection ---
  const hardFailureDetails = new Map<HardFailureCategory, string>();

  if (evidence.aircraftSnapshot.crashed) {
    hardFailureDetails.set('crashed', 'Aircraft crashed during/before capture');
  }

  if (objective.requiredCameraMode !== undefined && evidence.cameraSnapshot.cameraMode !== objective.requiredCameraMode) {
    hardFailureDetails.set(
      'camera',
      `Camera mode "${evidence.cameraSnapshot.cameraMode}" does not match required "${objective.requiredCameraMode}"`,
    );
  }
  if (objective.fovConstraints) {
    const fov = q(evidence.cameraSnapshot.projection.verticalFovDegrees);
    const { minVerticalFovDeg, maxVerticalFovDeg } = objective.fovConstraints;
    const belowMin = minVerticalFovDeg !== undefined && fov < q(minVerticalFovDeg);
    const aboveMax = maxVerticalFovDeg !== undefined && fov > q(maxVerticalFovDeg);
    if (belowMin || aboveMax) {
      hardFailureDetails.set('camera', `Vertical FOV ${fov} outside required FOV constraints`);
    }
  }

  if (!allPrimarySatisfied || satisfiedRequiredIds.length < objective.minRequiredSubjectCount) {
    hardFailureDetails.set(
      'subjectVisibility',
      `Only ${satisfiedRequiredIds.length}/${requiredSubjectIds.length} required subjects sufficiently visible (min ${objective.minRequiredSubjectCount}, all primaries required)`,
    );
  }

  let viewingSideFailed = false;
  for (const observation of primaryObservations) {
    if (observation.viewingSide === null || !objective.allowedViewingSides.includes(observation.viewingSide)) {
      viewingSideFailed = true;
    }
  }
  if (viewingSideFailed) {
    hardFailureDetails.set('viewingSide', 'Primary subject viewed from a disallowed side');
  }

  let distanceBelowMin = false;
  let distanceAboveMax = false;
  for (const observation of primaryObservations) {
    const d = q(observation.distanceMeters);
    if (d < q(objective.cameraToSubjectDistanceRange.min)) {
      distanceBelowMin = true;
    } else if (d > q(objective.cameraToSubjectDistanceRange.max)) {
      distanceAboveMax = true;
    }
  }
  if (distanceBelowMin || distanceAboveMax) {
    hardFailureDetails.set('distance', 'Camera-to-subject distance outside required range');
  }

  const altitudeOk = evaluateAltitudeRange(q(evidence.aircraftSnapshot.altitudeMeters), objective.altitudeRange);
  if (!altitudeOk) {
    hardFailureDetails.set('altitude', 'Aircraft altitude outside required range');
  }

  const zoneOk =
    objective.requiredAircraftPositionZoneId === undefined ||
    evidence.aircraftSnapshot.positionZoneId === objective.requiredAircraftPositionZoneId;
  if (!zoneOk) {
    hardFailureDetails.set('positionZone', 'Aircraft is not in the required position zone');
  }

  const losOk = q(evidence.spatialContext.lineOfSightRatio) >= q(objective.lineOfSightMin);
  const obstructionOk = q(evidence.spatialContext.obstructionRatio) <= q(objective.obstructionMax);
  if (!losOk || !obstructionOk) {
    hardFailureDetails.set('lineOfSight', 'Line of sight to the primary subject(s) is insufficiently clear');
  }

  const linearSpeedMps = vecLength(evidence.aircraftSnapshot.linearVelocityMps);
  const angularSpeedRadps = vecLength(evidence.aircraftSnapshot.bodyAngularVelocityRadps);
  const speedEval = evaluateSpeedThresholds(
    q(linearSpeedMps),
    q(angularSpeedRadps),
    objective.maxLinearSpeedMps,
    objective.maxBodyAngularSpeedRadps,
  );
  const stableTicks = q(evidence.stability.stableDurationTicks as unknown as number);
  const requiredStabilityTicks = q(objective.stabilityDurationTicks as unknown as number);
  const stabilityDurationOk = stableTicks >= requiredStabilityTicks;
  const stabilityOk = speedEval.withinAllThresholds && stabilityDurationOk;
  if (!stabilityOk) {
    hardFailureDetails.set('stability', 'Aircraft is not sufficiently stable (speed and/or hold-duration threshold)');
  }

  const hardFailureReasons = HARD_FAILURE_CATEGORY_ORDER.filter((category) => hardFailureDetails.has(category)).map(
    (category) => `${category}: ${hardFailureDetails.get(category) ?? ''}`,
  );
  const passed = hardFailureReasons.length === 0;

  // --- feedback accumulation (insertion order, deduped) ---
  const discoveredFeedback: FeedbackCode[] = [];
  function addFeedback(code: FeedbackCode): void {
    if (!discoveredFeedback.includes(code)) {
      discoveredFeedback.push(code);
    }
  }

  // --- component scores (integers, computed independent of aggregation order) ---
  const scores: Record<ScoringComponentId, number> = {
    visibility: 0,
    framing: 0,
    centering: 0,
    coverage: 0,
    distance: 0,
    viewingAngle: 0,
    altitude: 0,
    positionZone: 0,
    lineOfSight: 0,
    stability: 0,
    bonus: 0,
  };

  // visibility
  const requiredCount = Math.max(1, requiredSubjectIds.length);
  scores.visibility = Math.round((satisfiedRequiredIds.length / requiredCount) * maxScoreFor('visibility'));
  if (hardFailureDetails.has('subjectVisibility')) {
    addFeedback('SUBJECT_NOT_VISIBLE');
  }

  // framing
  const frameRatios = primaryObservations
    .map((o) => o.frameIntersectionRatio)
    .filter((v): v is number => v !== null)
    .map(q);
  const avgFrameRatio = average(frameRatios);
  scores.framing = avgFrameRatio === null ? 0 : Math.round(clamp01(avgFrameRatio) * maxScoreFor('framing'));
  if (avgFrameRatio !== null && avgFrameRatio >= 0.999) {
    addFeedback('EXCELLENT_FRAMING');
  }

  // centering
  const centeringErrors = primaryObservations
    .map((o) => o.centeringError)
    .filter((v): v is number => v !== null)
    .map(q);
  const avgCenteringError = average(centeringErrors);
  const maxCenteringError = Math.max(1e-9, q(objective.centeringTarget.maxCenteringError));
  const centeringCloseness = avgCenteringError === null ? 0 : clamp01(1 - avgCenteringError / maxCenteringError);
  scores.centering = Math.round(centeringCloseness * maxScoreFor('centering'));
  if (avgCenteringError !== null && avgCenteringError > maxCenteringError) {
    addFeedback('CENTER_SUBJECT');
  }

  // coverage
  const coverageRatios = primaryObservations
    .map((o) => o.coverageRatio)
    .filter((v): v is number => v !== null)
    .map(q);
  const avgCoverage = average(coverageRatios);
  const coverageResult = scoreRangeMetric(avgCoverage, objective.coverageRange, q);
  scores.coverage = Math.round(coverageResult.closeness * maxScoreFor('coverage'));
  if (coverageResult.direction === 'below') addFeedback('MOVE_CLOSER');
  if (coverageResult.direction === 'above') addFeedback('MOVE_FARTHER');

  // distance (note: direction is inverted relative to coverage — see module/README notes)
  const distances = primaryObservations.map((o) => q(o.distanceMeters));
  const avgDistance = average(distances);
  const distanceResult = scoreRangeMetric(avgDistance, objective.cameraToSubjectDistanceRange, q);
  scores.distance = Math.round(distanceResult.closeness * maxScoreFor('distance'));
  if (distanceResult.direction === 'below') addFeedback('MOVE_FARTHER'); // too close
  if (distanceResult.direction === 'above') addFeedback('MOVE_CLOSER'); // too far

  // viewingAngle
  const viewingAngles = primaryObservations
    .map((o) => o.viewingAngleDeg)
    .filter((v): v is number => v !== null)
    .map(q);
  const avgViewingAngle = average(viewingAngles);
  const viewingAngleResult = scoreRangeMetric(avgViewingAngle, objective.viewingAngleRangeDeg, q);
  scores.viewingAngle = Math.round(viewingAngleResult.closeness * maxScoreFor('viewingAngle'));

  if (viewingSideFailed) {
    addFeedback('WRONG_VIEWING_SIDE');
  }

  // altitude
  scores.altitude = altitudeOk ? maxScoreFor('altitude') : 0;
  if (!altitudeOk) {
    if (q(evidence.aircraftSnapshot.altitudeMeters) < q(objective.altitudeRange.minMeters)) {
      addFeedback('TOO_LOW');
    } else {
      addFeedback('TOO_HIGH');
    }
  }

  // positionZone
  scores.positionZone = zoneOk ? maxScoreFor('positionZone') : 0;

  // lineOfSight
  scores.lineOfSight = Math.round(clamp01(q(evidence.spatialContext.lineOfSightRatio)) * maxScoreFor('lineOfSight'));
  if (!losOk || !obstructionOk) {
    addFeedback('VIEW_OBSTRUCTED');
  }

  // stability
  const requiredTicksForScore = Math.max(1, requiredStabilityTicks);
  scores.stability = Math.round(clamp01(stableTicks / requiredTicksForScore) * maxScoreFor('stability'));
  if (!stabilityOk) {
    addFeedback('HOLD_STEADY');
  }

  // bonus — only awarded on an otherwise-passing capture
  let bonusTotal = 0;
  if (passed && objective.bonusConditions) {
    const bonusContext: BonusEvalContext = {
      avgCoverage,
      avgCenteringError,
      avgDistance,
      distanceRange: objective.cameraToSubjectDistanceRange,
      stableTicks,
      framingScore: scores.framing,
      framingMaxScore: maxScoreFor('framing'),
      centeringScore: scores.centering,
      centeringMaxScore: maxScoreFor('centering'),
      coverageScore: scores.coverage,
      coverageMaxScore: maxScoreFor('coverage'),
    };
    for (const condition of objective.bonusConditions) {
      if (evaluateBonusCondition(condition, bonusContext, q)) {
        bonusTotal += condition.scoreBonus;
        if (condition.feedbackCode) {
          addFeedback(condition.feedbackCode);
        }
      }
    }
  }
  scores.bonus = Math.round(clampToRange(bonusTotal, 0, maxScoreFor('bonus')));
  if (scores.bonus > 0) {
    addFeedback('BONUS_COMPOSITION');
  }

  // --- fixed-order aggregation (determinism policy item 3) ---
  const components: PhotoScoreComponent[] = SCORING_COMPONENT_ORDER.map((id) => ({
    componentId: id,
    rawScore: scores[id],
    maxScore: maxScoreFor(id),
  }));
  const totalScore = components.reduce((sum, component) => sum + component.rawScore, 0);
  const maxScoreTotal = components.reduce((sum, component) => sum + component.maxScore, 0);
  const normalizedScore = maxScoreTotal > 0 ? quantize(totalScore / maxScoreTotal, scale) : 0;

  // --- feedback ordering: policy priority first, then remaining discovered codes in discovery order ---
  const orderedFeedback: FeedbackCode[] = [];
  for (const code of policy.hardFailureFeedbackPriority) {
    if (discoveredFeedback.includes(code) && !orderedFeedback.includes(code)) {
      orderedFeedback.push(code);
    }
  }
  for (const code of discoveredFeedback) {
    if (!orderedFeedback.includes(code)) {
      orderedFeedback.push(code);
    }
  }

  const diagnostics: Readonly<Record<string, unknown>> = {
    satisfiedRequiredSubjectCount: satisfiedRequiredIds.length,
    requiredSubjectCount: requiredSubjectIds.length,
    primarySubjectCount: primarySubjectIds.length,
    averageFrameIntersectionRatio: avgFrameRatio,
    averageCenteringError: avgCenteringError,
    averageCoverageRatio: avgCoverage,
    averageCameraToSubjectDistanceMeters: avgDistance,
    averageViewingAngleDeg: avgViewingAngle,
    bonusPointsAwarded: scores.bonus,
  };

  return {
    scoringPolicyVersion: policy.policyVersion,
    passed,
    totalScore,
    maxScore: maxScoreTotal,
    normalizedScore,
    components,
    hardFailureReasons,
    feedbackCodes: orderedFeedback,
    diagnostics,
  };
}
