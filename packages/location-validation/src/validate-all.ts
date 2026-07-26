/**
 * `validateAll` — convenience composition of `validateLocationDefinition`
 * and `validateMissionDefinition` into a single merged `ValidationReport`,
 * for callers that want one report covering both a location and a mission
 * targeting it.
 */

import type { LocationDefinition } from '@fpv/location-domain';
import type { MissionDefinition } from '@fpv/mission-domain';
import { createReport, mergeReports, type ValidationReport } from '@fpv/simulation-contracts';
import type { LocationValidationContext, MissionValidationContext } from './context';
import { validateLocationDefinition } from './validate-location';
import { validateMissionDefinition } from './validate-mission';

export interface ValidateAllInput {
  readonly location?: LocationDefinition;
  readonly locationContext?: LocationValidationContext;
  readonly mission?: MissionDefinition;
  readonly missionContext?: MissionValidationContext;
}

/**
 * Runs whichever of `validateLocationDefinition` / `validateMissionDefinition`
 * apply (based on which of `location` / `mission` are present in `input`)
 * and merges the results into a single report. Never throws.
 */
export function validateAll(input: ValidateAllInput): ValidationReport {
  const reports: ValidationReport[] = [];
  if (input.location !== undefined) {
    reports.push(validateLocationDefinition(input.location, input.locationContext));
  }
  if (input.mission !== undefined) {
    reports.push(validateMissionDefinition(input.mission, input.missionContext));
  }
  if (reports.length === 0) {
    return createReport([]);
  }
  return mergeReports(reports);
}
