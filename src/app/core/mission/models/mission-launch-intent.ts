/**
 * Mission launch intent — identifiers and launch context only.
 * Full mission definitions, Three.js assets, Angular components, and Rapier
 * objects must not appear here.
 */

export type MissionAircraftSourceType = 'factory' | 'user-compiled';

export interface MissionFlightLaunchIntent {
  readonly kind: 'mission';
  readonly missionId: string;
  readonly missionVersion?: string;
  readonly locationId: string;
  readonly locationVersion?: string;
  readonly aircraftId: string;
  readonly aircraftSourceType: MissionAircraftSourceType;
  readonly spawnPointId?: string;
  readonly returnDestination?: 'fly' | 'expeditions' | 'home';
  /** Isolated development/test flags — never production mission content. */
  readonly developmentFlags?: {
    readonly skipLocationLoad?: boolean;
    readonly forceUnavailableSpatialQuery?: boolean;
    /** Presentation-only framing guide preview (Checkpoint 4). */
    readonly framingGuidePreview?: boolean;
  };
}

export type MissionLaunchIntentValidationResult =
  | { readonly ok: true; readonly intent: MissionFlightLaunchIntent }
  | { readonly ok: false; readonly code: 'MISSION_LAUNCH_INTENT_INVALID'; readonly reason: string };

export function isMissionFlightLaunchIntent(
  value: unknown,
): value is MissionFlightLaunchIntent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    v['kind'] === 'mission' &&
    typeof v['missionId'] === 'string' &&
    v['missionId'].length > 0 &&
    typeof v['locationId'] === 'string' &&
    v['locationId'].length > 0 &&
    typeof v['aircraftId'] === 'string' &&
    v['aircraftId'].length > 0 &&
    (v['aircraftSourceType'] === 'factory' || v['aircraftSourceType'] === 'user-compiled')
  );
}

export function validateMissionFlightLaunchIntent(
  value: unknown,
): MissionLaunchIntentValidationResult {
  if (!isMissionFlightLaunchIntent(value)) {
    return {
      ok: false,
      code: 'MISSION_LAUNCH_INTENT_INVALID',
      reason: 'Mission launch intent failed structural validation',
    };
  }
  // Reject embedded definition-shaped payloads if smuggled via extras.
  const record = value as unknown as Record<string, unknown>;
  for (const forbidden of [
    'missionDefinition',
    'locationDefinition',
    'aircraftDefinition',
    'scene',
    'world',
    'rapierWorld',
    'component',
  ]) {
    if (forbidden in record) {
      return {
        ok: false,
        code: 'MISSION_LAUNCH_INTENT_INVALID',
        reason: `Mission launch intent must not embed "${forbidden}"`,
      };
    }
  }
  return { ok: true, intent: value };
}

export function createMissionFlightLaunchIntent(
  partial: Omit<MissionFlightLaunchIntent, 'kind'> & { kind?: 'mission' },
): MissionLaunchIntentValidationResult {
  return validateMissionFlightLaunchIntent({
    kind: 'mission',
    ...partial,
  });
}
