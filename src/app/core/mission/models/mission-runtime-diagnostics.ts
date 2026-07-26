/**
 * Stable infrastructure failure / diagnostic codes for mission runtime.
 * Presentation may map these to user-facing strings; codes are authoritative.
 */

export const MISSION_INFRASTRUCTURE_CODES = [
  'MISSION_LAUNCH_INTENT_INVALID',
  'MISSION_DEFINITION_UNAVAILABLE',
  'LOCATION_DEFINITION_UNAVAILABLE',
  'LOCATION_VALIDATION_FAILED',
  'LOCATION_RUNTIME_LOAD_FAILED',
  'AIRCRAFT_INCOMPATIBLE',
  'AIRCRAFT_CAPABILITY_ADAPTER_FAILED',
  'CAMERA_RIG_RESOLUTION_FAILED',
  'SPATIAL_QUERY_UNAVAILABLE',
  'AUTHORITATIVE_STEP_OBSERVER_FAILED',
  'STALE_RUNTIME_SESSION',
] as const;

export type MissionInfrastructureCode = (typeof MISSION_INFRASTRUCTURE_CODES)[number];

export interface MissionRuntimeDiagnostic {
  readonly code: MissionInfrastructureCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}
