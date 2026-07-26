/**
 * `validatePhotographyObjective` — structural validation of a
 * `PhotographyObjectiveDefinition` (and, optionally, cross-checks against a
 * `PhotographyScoringPolicy`). Never throws: malformed input (including
 * input that does not actually conform to the TypeScript shape at runtime,
 * e.g. data loaded from disk/network) always produces a `ValidationReport`
 * with `error`-severity issues rather than an exception.
 */

import { createIssue, createReport, isExactVersion, isFiniteNumber, type ValidationIssue, type ValidationReport } from '@fpv/simulation-contracts';
import type { PhotographyObjectiveDefinition } from './objective';
import { SCORING_COMPONENT_ORDER, type PhotographyScoringPolicy } from './scoring-policy';
import { isKnownFeedbackCode } from './feedback-codes';

const KNOWN_VIEWING_SIDES = new Set(['front', 'back', 'left', 'right']);
const KNOWN_CAMERA_MODES = new Set(['fpv', 'chase', 'orbit', 'photo-mode']);
const KNOWN_BONUS_KINDS = new Set([
  'coverage-above',
  'centering-below',
  'distance-within-tolerance-of-midpoint',
  'stability-duration-above',
  'composite-excellent-framing',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteRatio(value: unknown): value is number {
  return typeof value === 'number' && isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNumericRange(value: unknown): value is { min: number; max: number } {
  return (
    isRecord(value) &&
    typeof value['min'] === 'number' &&
    typeof value['max'] === 'number' &&
    isFiniteNumber(value['min']) &&
    isFiniteNumber(value['max'])
  );
}

/**
 * Validates a `PhotographyObjectiveDefinition`, optionally cross-checking
 * it against a `PhotographyScoringPolicy`. Returns a `ValidationReport`
 * (never throws).
 */
export function validatePhotographyObjective(
  def: PhotographyObjectiveDefinition,
  policy?: PhotographyScoringPolicy,
): ValidationReport {
  const issues: ValidationIssue[] = [];

  try {
    if (!isRecord(def)) {
      return createReport([createIssue('OBJ_NOT_AN_OBJECT', 'error', 'root', 'Objective definition must be an object')]);
    }

    const objectiveIdPath = 'objectiveId';
    if (!isNonEmptyString(def.objectiveId)) {
      issues.push(createIssue('OBJ_MISSING_ID', 'error', objectiveIdPath, 'objectiveId must be a non-empty string'));
    }

    if (!isNonEmptyString(def.version) || !isExactVersion(def.version)) {
      issues.push(createIssue('OBJ_INVALID_VERSION', 'error', 'version', 'version must be an exact major.minor.patch string'));
    }

    const requiredSubjectIds = Array.isArray(def.requiredSubjectIds) ? def.requiredSubjectIds : null;
    if (!requiredSubjectIds || requiredSubjectIds.length === 0 || !requiredSubjectIds.every(isNonEmptyString)) {
      issues.push(
        createIssue('OBJ_INVALID_REQUIRED_SUBJECTS', 'error', 'requiredSubjectIds', 'requiredSubjectIds must be a non-empty array of non-empty strings'),
      );
    }

    const primarySubjectIds = Array.isArray(def.primarySubjectIds) ? def.primarySubjectIds : null;
    if (!primarySubjectIds || !primarySubjectIds.every(isNonEmptyString)) {
      issues.push(createIssue('OBJ_INVALID_PRIMARY_SUBJECTS', 'error', 'primarySubjectIds', 'primarySubjectIds must be an array of non-empty strings'));
    }

    if (requiredSubjectIds && primarySubjectIds) {
      const requiredSet = new Set(requiredSubjectIds as string[]);
      const missingPrimaries = (primarySubjectIds as string[]).filter((id) => !requiredSet.has(id));
      if (missingPrimaries.length > 0) {
        issues.push(
          createIssue(
            'OBJ_PRIMARY_NOT_REQUIRED',
            'error',
            'primarySubjectIds',
            `primarySubjectIds must be a subset of requiredSubjectIds; not required: ${missingPrimaries.join(', ')}`,
          ),
        );
      }
    }

    if (def.secondarySubjectIds !== undefined) {
      const secondarySubjectIds = Array.isArray(def.secondarySubjectIds) ? def.secondarySubjectIds : null;
      if (!secondarySubjectIds || !secondarySubjectIds.every(isNonEmptyString)) {
        issues.push(createIssue('OBJ_INVALID_SECONDARY_SUBJECTS', 'error', 'secondarySubjectIds', 'secondarySubjectIds must be an array of non-empty strings when present'));
      } else if (requiredSubjectIds) {
        const requiredSet = new Set(requiredSubjectIds as string[]);
        const notRequired = (secondarySubjectIds as string[]).filter((id) => !requiredSet.has(id));
        if (notRequired.length > 0) {
          issues.push(
            createIssue(
              'OBJ_SECONDARY_NOT_REQUIRED',
              'warning',
              'secondarySubjectIds',
              `secondarySubjectIds not present in requiredSubjectIds: ${notRequired.join(', ')}`,
            ),
          );
        }
      }
    }

    // Achievable subject-count check
    if (requiredSubjectIds && primarySubjectIds && typeof def.minRequiredSubjectCount === 'number') {
      const minCount = def.minRequiredSubjectCount;
      if (!Number.isInteger(minCount) || minCount < 1) {
        issues.push(createIssue('OBJ_INVALID_MIN_SUBJECT_COUNT', 'error', 'minRequiredSubjectCount', 'minRequiredSubjectCount must be a positive integer'));
      } else {
        if (minCount > requiredSubjectIds.length) {
          issues.push(
            createIssue(
              'OBJ_UNACHIEVABLE_MIN_SUBJECT_COUNT',
              'error',
              'minRequiredSubjectCount',
              `minRequiredSubjectCount (${minCount}) exceeds requiredSubjectIds.length (${requiredSubjectIds.length}) — unachievable`,
            ),
          );
        }
        if (minCount < primarySubjectIds.length) {
          issues.push(
            createIssue(
              'OBJ_MIN_SUBJECT_COUNT_BELOW_PRIMARIES',
              'error',
              'minRequiredSubjectCount',
              `minRequiredSubjectCount (${minCount}) is less than primarySubjectIds.length (${primarySubjectIds.length}) — primaries are always required`,
            ),
          );
        }
      }
    } else if (typeof def.minRequiredSubjectCount !== 'number') {
      issues.push(createIssue('OBJ_MISSING_MIN_SUBJECT_COUNT', 'error', 'minRequiredSubjectCount', 'minRequiredSubjectCount must be a number'));
    }

    if (def.requiredCameraMode !== undefined && !KNOWN_CAMERA_MODES.has(def.requiredCameraMode as string)) {
      issues.push(createIssue('OBJ_UNKNOWN_CAMERA_MODE', 'error', 'requiredCameraMode', `Unknown camera mode: ${String(def.requiredCameraMode)}`));
    }

    if (def.fovConstraints !== undefined) {
      const fov = def.fovConstraints as Record<string, unknown>;
      if (!isRecord(fov)) {
        issues.push(createIssue('OBJ_INVALID_FOV_CONSTRAINTS', 'error', 'fovConstraints', 'fovConstraints must be an object when present'));
      } else {
        const min = fov['minVerticalFovDeg'];
        const max = fov['maxVerticalFovDeg'];
        if (min !== undefined && (typeof min !== 'number' || !isFiniteNumber(min) || min <= 0 || min >= 180)) {
          issues.push(createIssue('OBJ_INVALID_FOV_MIN', 'error', 'fovConstraints.minVerticalFovDeg', 'minVerticalFovDeg must be a finite number in (0, 180)'));
        }
        if (max !== undefined && (typeof max !== 'number' || !isFiniteNumber(max) || max <= 0 || max >= 180)) {
          issues.push(createIssue('OBJ_INVALID_FOV_MAX', 'error', 'fovConstraints.maxVerticalFovDeg', 'maxVerticalFovDeg must be a finite number in (0, 180)'));
        }
        if (typeof min === 'number' && typeof max === 'number' && min > max) {
          issues.push(createIssue('OBJ_INVERTED_FOV_RANGE', 'error', 'fovConstraints', 'minVerticalFovDeg must be <= maxVerticalFovDeg'));
        }
      }
    }

    if (!isFiniteRatio(def.visibilityMin)) {
      issues.push(createIssue('OBJ_INVALID_VISIBILITY_MIN', 'error', 'visibilityMin', 'visibilityMin must be a finite number in [0, 1]'));
    }

    if (!isNumericRange(def.coverageRange)) {
      issues.push(createIssue('OBJ_INVALID_COVERAGE_RANGE', 'error', 'coverageRange', 'coverageRange must be { min, max } finite numbers'));
    } else {
      const { min, max } = def.coverageRange;
      if (min > max) issues.push(createIssue('OBJ_INVERTED_COVERAGE_RANGE', 'error', 'coverageRange', 'coverageRange.min must be <= coverageRange.max'));
      if (min < 0 || max > 1) issues.push(createIssue('OBJ_COVERAGE_RANGE_OUT_OF_UNIT', 'error', 'coverageRange', 'coverageRange bounds must be within [0, 1]'));
    }

    if (!isRecord(def.centeringTarget) || !isRecord(def.centeringTarget.targetAnchor) || typeof def.centeringTarget.maxCenteringError !== 'number') {
      issues.push(createIssue('OBJ_INVALID_CENTERING_TARGET', 'error', 'centeringTarget', 'centeringTarget must have a targetAnchor and a numeric maxCenteringError'));
    } else if (!isFiniteNumber(def.centeringTarget.maxCenteringError) || def.centeringTarget.maxCenteringError < 0) {
      issues.push(createIssue('OBJ_INVALID_MAX_CENTERING_ERROR', 'error', 'centeringTarget.maxCenteringError', 'maxCenteringError must be a finite non-negative number'));
    }

    if (!isNumericRange(def.cameraToSubjectDistanceRange)) {
      issues.push(createIssue('OBJ_INVALID_DISTANCE_RANGE', 'error', 'cameraToSubjectDistanceRange', 'cameraToSubjectDistanceRange must be { min, max } finite numbers'));
    } else {
      const { min, max } = def.cameraToSubjectDistanceRange;
      if (min < 0) issues.push(createIssue('OBJ_NEGATIVE_DISTANCE_MIN', 'error', 'cameraToSubjectDistanceRange.min', 'min must be >= 0'));
      if (min > max) issues.push(createIssue('OBJ_INVERTED_DISTANCE_RANGE', 'error', 'cameraToSubjectDistanceRange', 'min must be <= max'));
    }

    if (def.aircraftToSubjectDistanceRange !== undefined && !isNumericRange(def.aircraftToSubjectDistanceRange)) {
      issues.push(createIssue('OBJ_INVALID_AIRCRAFT_DISTANCE_RANGE', 'error', 'aircraftToSubjectDistanceRange', 'aircraftToSubjectDistanceRange must be { min, max } finite numbers when present'));
    }

    if (!isNumericRange(def.viewingAngleRangeDeg)) {
      issues.push(createIssue('OBJ_INVALID_VIEWING_ANGLE_RANGE', 'error', 'viewingAngleRangeDeg', 'viewingAngleRangeDeg must be { min, max } finite numbers'));
    } else {
      const { min, max } = def.viewingAngleRangeDeg;
      if (min < 0 || max > 180) issues.push(createIssue('OBJ_VIEWING_ANGLE_OUT_OF_RANGE', 'error', 'viewingAngleRangeDeg', 'viewingAngleRangeDeg bounds must be within [0, 180]'));
      if (min > max) issues.push(createIssue('OBJ_INVERTED_VIEWING_ANGLE_RANGE', 'error', 'viewingAngleRangeDeg', 'min must be <= max'));
    }

    const allowedViewingSides = Array.isArray(def.allowedViewingSides) ? def.allowedViewingSides : null;
    if (!allowedViewingSides || allowedViewingSides.length === 0) {
      issues.push(createIssue('OBJ_MISSING_ALLOWED_VIEWING_SIDES', 'error', 'allowedViewingSides', 'allowedViewingSides must be a non-empty array'));
    } else {
      const unknown = allowedViewingSides.filter((side) => !KNOWN_VIEWING_SIDES.has(side as string));
      if (unknown.length > 0) {
        issues.push(createIssue('OBJ_UNKNOWN_VIEWING_SIDE', 'error', 'allowedViewingSides', `Unknown viewing side(s): ${unknown.join(', ')}`));
      }
    }

    if (!isRecord(def.altitudeRange) || typeof def.altitudeRange.minMeters !== 'number' || typeof def.altitudeRange.maxMeters !== 'number') {
      issues.push(createIssue('OBJ_INVALID_ALTITUDE_RANGE', 'error', 'altitudeRange', 'altitudeRange must be { minMeters, maxMeters } finite numbers'));
    } else if (def.altitudeRange.minMeters > def.altitudeRange.maxMeters) {
      issues.push(createIssue('OBJ_INVERTED_ALTITUDE_RANGE', 'error', 'altitudeRange', 'minMeters must be <= maxMeters'));
    }

    if (!isFiniteRatio(def.lineOfSightMin)) {
      issues.push(createIssue('OBJ_INVALID_LOS_MIN', 'error', 'lineOfSightMin', 'lineOfSightMin must be a finite number in [0, 1]'));
    }
    if (!isFiniteRatio(def.obstructionMax)) {
      issues.push(createIssue('OBJ_INVALID_OBSTRUCTION_MAX', 'error', 'obstructionMax', 'obstructionMax must be a finite number in [0, 1]'));
    }

    if (typeof def.maxLinearSpeedMps !== 'number' || !isFiniteNumber(def.maxLinearSpeedMps) || def.maxLinearSpeedMps <= 0) {
      issues.push(createIssue('OBJ_INVALID_MAX_LINEAR_SPEED', 'error', 'maxLinearSpeedMps', 'maxLinearSpeedMps must be a finite positive number'));
    }
    if (typeof def.maxBodyAngularSpeedRadps !== 'number' || !isFiniteNumber(def.maxBodyAngularSpeedRadps) || def.maxBodyAngularSpeedRadps <= 0) {
      issues.push(createIssue('OBJ_INVALID_MAX_ANGULAR_SPEED', 'error', 'maxBodyAngularSpeedRadps', 'maxBodyAngularSpeedRadps must be a finite positive number'));
    }
    if (typeof def.stabilityDurationTicks !== 'number' || !isFiniteNumber(def.stabilityDurationTicks as number) || (def.stabilityDurationTicks as number) < 0) {
      issues.push(createIssue('OBJ_INVALID_STABILITY_DURATION', 'error', 'stabilityDurationTicks', 'stabilityDurationTicks must be a finite non-negative tick count'));
    }

    if (!isRecord(def.attemptPolicy) || typeof def.attemptPolicy.retryable !== 'boolean') {
      issues.push(createIssue('OBJ_INVALID_ATTEMPT_POLICY', 'error', 'attemptPolicy', 'attemptPolicy must have a boolean retryable field'));
    } else if (def.attemptPolicy.maxAttempts !== undefined && (typeof def.attemptPolicy.maxAttempts !== 'number' || def.attemptPolicy.maxAttempts < 1)) {
      issues.push(createIssue('OBJ_INVALID_MAX_ATTEMPTS', 'error', 'attemptPolicy.maxAttempts', 'maxAttempts must be a positive number when present'));
    }

    if (def.bonusConditions !== undefined) {
      const bonusConditions = Array.isArray(def.bonusConditions) ? def.bonusConditions : null;
      if (!bonusConditions) {
        issues.push(createIssue('OBJ_INVALID_BONUS_CONDITIONS', 'error', 'bonusConditions', 'bonusConditions must be an array when present'));
      } else {
        bonusConditions.forEach((condition: unknown, index: number) => {
          const path = `bonusConditions[${index}]`;
          if (!isRecord(condition)) {
            issues.push(createIssue('OBJ_INVALID_BONUS_CONDITION', 'error', path, 'bonus condition must be an object'));
            return;
          }
          if (!isNonEmptyString(condition['id'])) {
            issues.push(createIssue('OBJ_BONUS_MISSING_ID', 'error', `${path}.id`, 'bonus condition id must be a non-empty string'));
          }
          if (!KNOWN_BONUS_KINDS.has(condition['kind'] as string)) {
            issues.push(createIssue('OBJ_UNKNOWN_BONUS_KIND', 'error', `${path}.kind`, `Unknown bonus condition kind: ${String(condition['kind'])}`));
          }
          if (typeof condition['thresholdValue'] !== 'number' || !isFiniteNumber(condition['thresholdValue'])) {
            issues.push(createIssue('OBJ_INVALID_BONUS_THRESHOLD', 'error', `${path}.thresholdValue`, 'thresholdValue must be a finite number'));
          }
          if (typeof condition['scoreBonus'] !== 'number' || !isFiniteNumber(condition['scoreBonus']) || condition['scoreBonus'] < 0) {
            issues.push(createIssue('OBJ_INVALID_BONUS_SCORE', 'error', `${path}.scoreBonus`, 'scoreBonus must be a finite non-negative number'));
          }
          if (condition['feedbackCode'] !== undefined && !isKnownFeedbackCode(condition['feedbackCode'] as string)) {
            issues.push(
              createIssue('OBJ_UNKNOWN_BONUS_FEEDBACK_CODE', 'error', `${path}.feedbackCode`, `Unknown feedback code: ${String(condition['feedbackCode'])}`),
            );
          }
        });
      }
    }

    // Cross-check against the scoring policy, if supplied.
    if (policy !== undefined) {
      if (!isNonEmptyString(policy.policyVersion) || !isExactVersion(policy.policyVersion)) {
        issues.push(createIssue('POLICY_INVALID_VERSION', 'error', 'policy.policyVersion', 'policy.policyVersion must be an exact major.minor.patch string'));
      }
      const seenComponents = new Set<string>();
      for (const component of policy.components ?? []) {
        seenComponents.add(component.componentId);
        if (typeof component.maxScore !== 'number' || !isFiniteNumber(component.maxScore) || component.maxScore < 0) {
          issues.push(createIssue('POLICY_INVALID_COMPONENT_SCORE', 'error', `policy.components.${component.componentId}`, 'maxScore must be a finite non-negative number'));
        }
      }
      const missingComponents = SCORING_COMPONENT_ORDER.filter((id) => !seenComponents.has(id));
      if (missingComponents.length > 0) {
        issues.push(createIssue('POLICY_MISSING_COMPONENTS', 'error', 'policy.components', `Missing scoring components: ${missingComponents.join(', ')}`));
      }
      if (!(policy.quantizationScale > 0)) {
        issues.push(createIssue('POLICY_INVALID_QUANTIZATION_SCALE', 'error', 'policy.quantizationScale', 'quantizationScale must be a positive number'));
      }
      for (const code of policy.hardFailureFeedbackPriority ?? []) {
        if (!isKnownFeedbackCode(code)) {
          issues.push(createIssue('POLICY_UNKNOWN_FEEDBACK_CODE', 'error', 'policy.hardFailureFeedbackPriority', `Unknown feedback code: ${String(code)}`));
        }
      }
    }
  } catch (error) {
    // Belt-and-suspenders: validation must never throw, even on wildly malformed input.
    issues.push(
      createIssue('OBJ_VALIDATION_INTERNAL_ERROR', 'error', 'root', `Unexpected error while validating objective: ${String(error)}`),
    );
  }

  return createReport(issues);
}
