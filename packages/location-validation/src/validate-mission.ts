/**
 * `validateMissionDefinition` — deep, cross-field structural validation of
 * a `MissionDefinition`, optionally cross-checked against a target
 * `LocationDefinition` and the photography objective/scoring catalogs.
 * Never throws.
 *
 * This is the one place allowed to join `mission-domain`'s opaque
 * `photographyObjectiveId` / `zoneId` string references against actual
 * `photography-domain` / `location-domain` content — see each package's
 * module docs for why they don't do this themselves.
 */

import {
  assertNoUnsupportedAircraftConstraints,
  isPhotographyObjective,
  isReachZoneObjective,
  isReturnToZoneObjective,
  MISSION_SCHEMA_VERSION,
  type MissionDefinition,
  type ObjectiveDefinition,
} from '@fpv/mission-domain';
import { validatePhotographyObjective, type PhotographyScoringPolicy } from '@fpv/photography-domain';
import {
  createIssue,
  createReport,
  isCompatibleMajor,
  isExactVersion,
  isFiniteNumber,
  type ValidationIssue,
  type ValidationReport,
} from '@fpv/simulation-contracts';
import type { MissionValidationContext } from './context';
import { checkExactVersionField, idStr, isNonEmptyString } from './shared';

/** Raw controller/calibration field names that must never appear anywhere in a mission definition payload. */
const CONTROLLER_FIELD_KEYS: ReadonlySet<string> = new Set([
  'controllerCalibrationVersion',
  'yawInverted',
  'rawAxisMapping',
  'gamepadAxes',
  'calibration',
]);

/**
 * Recursively scans an arbitrary (possibly untrusted/raw) value for any key
 * in `CONTROLLER_FIELD_KEYS`, at any depth, pushing one
 * `CONTROLLER_FIELD_IN_MISSION_DEFINITION` issue per occurrence found.
 */
function scanForControllerCalibrationFields(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
  seen: Set<unknown>,
): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForControllerCalibrationFields(item, issues, `${path}[${index}]`, seen));
    return;
  }

  for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    const fieldPath = path.length > 0 ? `${path}.${key}` : key;
    if (CONTROLLER_FIELD_KEYS.has(key)) {
      issues.push(
        createIssue(
          'CONTROLLER_FIELD_IN_MISSION_DEFINITION',
          'error',
          fieldPath,
          `Mission definition must never contain controller-calibration field "${key}"; raw controller/calibration data must not cross into mission content.`,
          { entityId: key },
        ),
      );
    }
    scanForControllerCalibrationFields(fieldValue, issues, fieldPath, seen);
  }
}

function validateMissionIdentity(mission: MissionDefinition, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(mission?.missionId)) {
    issues.push(createIssue('EMPTY_ID', 'error', 'missionId', 'missionId must be a non-empty string'));
  }
  checkExactVersionField(mission?.versions?.version, 'versions.version', issues);
  checkExactVersionField(mission?.versions?.schemaVersion, 'versions.schemaVersion', issues);
  checkExactVersionField(mission?.compatibilityVersion, 'compatibilityVersion', issues);

  const schemaVersion = mission?.versions?.schemaVersion;
  if (isNonEmptyString(schemaVersion) && isExactVersion(schemaVersion) && !isCompatibleMajor(schemaVersion, MISSION_SCHEMA_VERSION)) {
    issues.push(
      createIssue(
        'UNSUPPORTED_VERSION',
        'error',
        'versions.schemaVersion',
        `Mission schemaVersion "${schemaVersion}" is not compatible with the supported major version ("${MISSION_SCHEMA_VERSION}").`,
      ),
    );
  }
}

function validateObjectiveIdUniqueness(mission: MissionDefinition, issues: ValidationIssue[]): void {
  const seen = new Set<string>();
  (mission.objectives ?? []).forEach((objective, i) => {
    const path = `objectives[${i}].objectiveId`;
    if (!isNonEmptyString(objective?.objectiveId)) {
      issues.push(createIssue('EMPTY_ID', 'error', path, 'objectiveId must be a non-empty string'));
      return;
    }
    const id = idStr(objective.objectiveId);
    if (seen.has(id)) {
      issues.push(createIssue('DUPLICATE_OBJECTIVE_ID', 'error', path, `Duplicate objectiveId "${id}"`, { entityId: id }));
      return;
    }
    seen.add(id);
  });
}

function findObjective(mission: MissionDefinition, objectiveId: unknown): ObjectiveDefinition | undefined {
  return mission.objectives?.find((objective) => idStr(objective.objectiveId) === idStr(objectiveId));
}

function validateObjectiveOrdering(mission: MissionDefinition, issues: ValidationIssue[]): void {
  const grouping = mission.grouping;
  if (grouping?.mode !== 'sequential') {
    return;
  }
  const requiredIds = grouping.requiredObjectiveIds ?? [];
  requiredIds.forEach((objectiveId, i) => {
    const objective = findObjective(mission, objectiveId);
    if (
      objective !== undefined &&
      isReturnToZoneObjective(objective) &&
      objective.afterRequiredObjectives === true &&
      i !== requiredIds.length - 1
    ) {
      issues.push(
        createIssue(
          'INVALID_OBJECTIVE_ORDER',
          'error',
          `grouping.requiredObjectiveIds[${i}]`,
          `Objective "${idStr(objectiveId)}" has afterRequiredObjectives: true but is not ordered last in grouping.requiredObjectiveIds.`,
          { entityId: idStr(objectiveId) },
        ),
      );
    }
  });
}

function validateLocationReference(mission: MissionDefinition, context: MissionValidationContext, issues: ValidationIssue[]): void {
  const location = context.location;
  if (location === undefined) {
    return;
  }
  if (isNonEmptyString(mission?.requiredLocationId) && idStr(mission.requiredLocationId) !== idStr(location.identity.locationId)) {
    issues.push(
      createIssue(
        'LOCATION_REFERENCE_MISMATCH',
        'error',
        'requiredLocationId',
        `Mission requiredLocationId "${idStr(mission.requiredLocationId)}" does not match context.location's id "${idStr(location.identity.locationId)}".`,
      ),
    );
  }
}

function validateZoneReference(zoneId: unknown, path: string, context: MissionValidationContext, issues: ValidationIssue[]): void {
  const location = context.location;
  if (location === undefined || !isNonEmptyString(zoneId)) {
    return;
  }
  const exists = location.gameplaySpatial.zones.some((zone) => idStr(zone.id) === idStr(zoneId));
  if (!exists) {
    issues.push(createIssue('INVALID_ZONE_REFERENCE', 'error', path, `Referenced zoneId "${idStr(zoneId)}" does not exist on context.location.`, { entityId: idStr(zoneId) }));
  }
}

function validateCompletionPolicy(mission: MissionDefinition, issues: ValidationIssue[]): void {
  const policy = mission.completionPolicy;
  const requiredCount = mission.grouping?.requiredObjectiveIds?.length ?? 0;
  if (policy?.mode === 'minimum_count') {
    if (!Number.isFinite(policy.minimumCount) || policy.minimumCount < 0 || policy.minimumCount > requiredCount) {
      issues.push(
        createIssue(
          'INVALID_COMPLETION_POLICY',
          'error',
          'completionPolicy.minimumCount',
          `completionPolicy.minimumCount (${String(policy.minimumCount)}) must be between 0 and grouping.requiredObjectiveIds.length (${requiredCount}).`,
        ),
      );
    }
  } else if (policy?.mode === 'return_zone_after_required') {
    const objective = findObjective(mission, policy.returnZoneObjectiveId);
    if (objective === undefined) {
      issues.push(
        createIssue(
          'INVALID_COMPLETION_POLICY',
          'error',
          'completionPolicy.returnZoneObjectiveId',
          `completionPolicy.returnZoneObjectiveId "${idStr(policy.returnZoneObjectiveId)}" does not reference an objective in mission.objectives.`,
        ),
      );
    }
  }
}

function validateOptionalObjectivesDoNotBlockCompletion(mission: MissionDefinition, issues: ValidationIssue[]): void {
  const grouping = mission.grouping;
  const requiredIds = new Set((grouping?.requiredObjectiveIds ?? []).map(idStr));

  (grouping?.optionalObjectiveIds ?? []).forEach((id, i) => {
    if (requiredIds.has(idStr(id))) {
      issues.push(
        createIssue(
          'OPTIONAL_OBJECTIVE_BLOCKS_COMPLETION',
          'error',
          `grouping.optionalObjectiveIds[${i}]`,
          `Objective "${idStr(id)}" appears in both requiredObjectiveIds and optionalObjectiveIds; optional objectives must never gate required completion.`,
          { entityId: idStr(id) },
        ),
      );
    }
  });

  (grouping?.bonusObjectiveIds ?? []).forEach((id, i) => {
    if (requiredIds.has(idStr(id))) {
      issues.push(
        createIssue(
          'OPTIONAL_OBJECTIVE_BLOCKS_COMPLETION',
          'error',
          `grouping.bonusObjectiveIds[${i}]`,
          `Objective "${idStr(id)}" appears in both requiredObjectiveIds and bonusObjectiveIds; bonus objectives must never gate required completion.`,
          { entityId: idStr(id) },
        ),
      );
    }
  });
}

function validateTimePolicy(mission: MissionDefinition, issues: ValidationIssue[]): void {
  const timePolicy = mission.timePolicy;
  const hardLimit = timePolicy?.hardLimitTicks;
  if (hardLimit !== null && hardLimit !== undefined) {
    if (typeof hardLimit !== 'number' || !isFiniteNumber(hardLimit) || hardLimit < 0) {
      issues.push(createIssue('INVALID_TIME_POLICY', 'error', 'timePolicy.hardLimitTicks', 'timePolicy.hardLimitTicks must be null or a finite number >= 0.'));
    }
  }
  const timeBonus = timePolicy?.timeBonus;
  if (timeBonus !== undefined) {
    if (typeof timeBonus.maxBonusPoints !== 'number' || !isFiniteNumber(timeBonus.maxBonusPoints) || timeBonus.maxBonusPoints < 0) {
      issues.push(createIssue('INVALID_TIME_POLICY', 'error', 'timePolicy.timeBonus.maxBonusPoints', 'timeBonus.maxBonusPoints must be a finite number >= 0.'));
    }
    if (typeof timeBonus.targetElapsedTicks !== 'number' || !isFiniteNumber(timeBonus.targetElapsedTicks) || timeBonus.targetElapsedTicks < 0) {
      issues.push(createIssue('INVALID_TIME_POLICY', 'error', 'timePolicy.timeBonus.targetElapsedTicks', 'timeBonus.targetElapsedTicks must be a finite number >= 0.'));
    } else if (
      typeof hardLimit === 'number' &&
      isFiniteNumber(hardLimit) &&
      (timeBonus.targetElapsedTicks as number) > (hardLimit as number)
    ) {
      issues.push(
        createIssue(
          'INVALID_TIME_POLICY',
          'error',
          'timePolicy.timeBonus.targetElapsedTicks',
          'timeBonus.targetElapsedTicks must not exceed timePolicy.hardLimitTicks.',
        ),
      );
    }
  }
}

function validateAircraftConstraints(mission: MissionDefinition, issues: ValidationIssue[]): void {
  const report = assertNoUnsupportedAircraftConstraints(mission.aircraftCompatibilityPolicy);
  for (const issue of report.issues) {
    const mappedCode = issue.code === 'UNSUPPORTED_CONSTRAINT_ENDURANCE' ? 'UNSUPPORTED_ENDURANCE_CONSTRAINT' : 'UNSUPPORTED_AIRCRAFT_CONSTRAINT_FIELD';
    issues.push(createIssue(mappedCode, 'error', `aircraftCompatibilityPolicy.${issue.path}`, issue.message, issue.entityId !== undefined ? { entityId: issue.entityId } : undefined));
  }
}

/** Cross-checks scoring policy component weights for basic well-formedness, independent of `validatePhotographyObjective`'s own checks. */
function checkScoringWeightsWellFormed(policy: PhotographyScoringPolicy, path: string, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(policy?.policyVersion) || !isExactVersion(policy.policyVersion)) {
    issues.push(createIssue('INVALID_SCORE_WEIGHTS', 'error', `${path}.policyVersion`, `${path}.policyVersion must be an exact major.minor.patch version string.`));
  }
  const seen = new Set<string>();
  let hasInvalidComponent = false;
  for (const component of policy?.components ?? []) {
    if (seen.has(component.componentId)) {
      hasInvalidComponent = true;
    }
    seen.add(component.componentId);
    if (typeof component.maxScore !== 'number' || !isFiniteNumber(component.maxScore) || component.maxScore < 0) {
      hasInvalidComponent = true;
    }
  }
  if (hasInvalidComponent) {
    issues.push(createIssue('INVALID_SCORE_WEIGHTS', 'error', `${path}.components`, `${path}.components contains a duplicate componentId or a negative/non-finite maxScore.`));
  }
  if (typeof policy?.quantizationScale !== 'number' || !(policy.quantizationScale > 0)) {
    issues.push(createIssue('INVALID_SCORE_WEIGHTS', 'error', `${path}.quantizationScale`, `${path}.quantizationScale must be a positive number.`));
  }
}

function validatePhotographyObjectiveCrossReferences(mission: MissionDefinition, context: MissionValidationContext, issues: ValidationIssue[]): void {
  const catalog = context.photographyObjectives;
  const location = context.location;
  const scoringPolicy = context.scoringPolicies?.[0];

  mission.objectives?.forEach((objective, i) => {
    if (!isPhotographyObjective(objective)) {
      return;
    }
    const base = `objectives[${i}]`;

    if (catalog === undefined) {
      return;
    }
    const def = catalog.find((candidate) => idStr(candidate.objectiveId) === idStr(objective.photographyObjectiveId));
    if (def === undefined) {
      issues.push(
        createIssue(
          'UNKNOWN_PHOTOGRAPHY_OBJECTIVE_REF',
          'error',
          `${base}.photographyObjectiveId`,
          `Referenced photographyObjectiveId "${idStr(objective.photographyObjectiveId)}" was not found in context.photographyObjectives.`,
          { entityId: idStr(objective.photographyObjectiveId) },
        ),
      );
      return;
    }

    if (location !== undefined) {
      const locationSubjectIds = new Set(location.photographySubjects.map((subject) => idStr(subject.id)));
      const existingRequiredCount = def.requiredSubjectIds.filter((subjectId) => locationSubjectIds.has(idStr(subjectId))).length;

      def.requiredSubjectIds.forEach((subjectId) => {
        if (!locationSubjectIds.has(idStr(subjectId))) {
          issues.push(
            createIssue(
              'INVALID_SUBJECT_REFERENCE',
              'error',
              `${base}.photographyObjective.requiredSubjectIds`,
              `Photography objective "${idStr(def.objectiveId)}" requires subject "${idStr(subjectId)}" which does not exist on context.location.`,
              { entityId: idStr(subjectId) },
            ),
          );
        }
      });

      if (existingRequiredCount < def.minRequiredSubjectCount) {
        issues.push(
          createIssue(
            'IMPOSSIBLE_REQUIRED_SUBJECT_COUNT',
            'error',
            `${base}.photographyObjective.minRequiredSubjectCount`,
            `Photography objective "${idStr(def.objectiveId)}" requires minRequiredSubjectCount=${def.minRequiredSubjectCount} but only ${existingRequiredCount} of its requiredSubjectIds exist on context.location.`,
          ),
        );
      }

      if (def.requiredAircraftPositionZoneId !== undefined) {
        validateZoneReference(def.requiredAircraftPositionZoneId, `${base}.photographyObjective.requiredAircraftPositionZoneId`, context, issues);
      }
    }

    if (scoringPolicy !== undefined) {
      checkScoringWeightsWellFormed(scoringPolicy, `${base}.photographyObjective.scoringPolicy`, issues);
      const objectiveReport = validatePhotographyObjective(def, scoringPolicy);
      for (const issue of objectiveReport.issues) {
        issues.push(
          createIssue(issue.code, issue.severity, `${base}.photographyObjective.${issue.path}`, issue.message, issue.entityId !== undefined ? { entityId: issue.entityId } : undefined),
        );
      }
    }
  });
}

function validateSubjectAndZoneReferences(mission: MissionDefinition, context: MissionValidationContext, issues: ValidationIssue[]): void {
  mission.objectives?.forEach((objective, i) => {
    if (isReachZoneObjective(objective) || isReturnToZoneObjective(objective)) {
      validateZoneReference(objective.zoneId, `objectives[${i}].zoneId`, context, issues);
    }
  });

  (mission.failurePolicy?.prohibitedZone?.zoneIds ?? []).forEach((zoneId, i) => {
    validateZoneReference(zoneId, `failurePolicy.prohibitedZone.zoneIds[${i}]`, context, issues);
  });
}

/**
 * Deeply validates a `MissionDefinition` against structural, cross-field,
 * and (when supplied) context-dependent invariants — joining against a
 * target `LocationDefinition` and the photography objective/scoring
 * catalogs when provided. Never throws.
 */
export function validateMissionDefinition(
  mission: MissionDefinition,
  context: MissionValidationContext = {},
): ValidationReport {
  const issues: ValidationIssue[] = [];
  try {
    scanForControllerCalibrationFields(mission, issues, 'root', new Set());
    validateMissionIdentity(mission, issues);
    validateObjectiveIdUniqueness(mission, issues);
    validateObjectiveOrdering(mission, issues);
    validateLocationReference(mission, context, issues);
    validateSubjectAndZoneReferences(mission, context, issues);
    validatePhotographyObjectiveCrossReferences(mission, context, issues);
    validateCompletionPolicy(mission, issues);
    validateOptionalObjectivesDoNotBlockCompletion(mission, issues);
    validateTimePolicy(mission, issues);
    validateAircraftConstraints(mission, issues);
  } catch (error) {
    issues.push(createIssue('MISSION_VALIDATION_INTERNAL_ERROR', 'error', 'root', `Unexpected error while validating mission: ${String(error)}`));
  }
  return createReport(issues);
}
