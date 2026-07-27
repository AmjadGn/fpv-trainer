/**
 * Stable mission-scope key for Personal Best and history isolation.
 *
 * Format: `<mission-id>@<mission-version>#<scoring-policy-version>`
 *
 * Different mission or scoring-policy versions must never compete.
 */

export type MissionScopeKey = string & { readonly __brand: 'MissionScopeKey' };

export function asMissionScopeKey(value: string): MissionScopeKey {
  return value as MissionScopeKey;
}

export interface MissionScopeParts {
  readonly missionId: string;
  readonly missionVersion: string;
  readonly scoringPolicyVersion: string;
}

export function buildMissionScopeKey(parts: MissionScopeParts): MissionScopeKey {
  const missionId = parts.missionId.trim();
  const missionVersion = parts.missionVersion.trim();
  const scoringPolicyVersion = parts.scoringPolicyVersion.trim();
  if (!missionId || !missionVersion || !scoringPolicyVersion) {
    throw new Error('MISSION_SCOPE_KEY_INVALID: empty part');
  }
  if (missionId.includes('@') || missionId.includes('#')) {
    throw new Error('MISSION_SCOPE_KEY_INVALID: missionId contains delimiter');
  }
  if (missionVersion.includes('#') || missionVersion.includes('@')) {
    throw new Error('MISSION_SCOPE_KEY_INVALID: missionVersion contains delimiter');
  }
  return asMissionScopeKey(`${missionId}@${missionVersion}#${scoringPolicyVersion}`);
}

export function parseMissionScopeKey(key: string): MissionScopeParts | null {
  const at = key.indexOf('@');
  const hash = key.indexOf('#');
  if (at <= 0 || hash <= at + 1 || hash >= key.length - 1) {
    return null;
  }
  const missionId = key.slice(0, at);
  const missionVersion = key.slice(at + 1, hash);
  const scoringPolicyVersion = key.slice(hash + 1);
  if (!missionId || !missionVersion || !scoringPolicyVersion) {
    return null;
  }
  if (missionId.includes('@') || missionId.includes('#') || missionVersion.includes('@') || missionVersion.includes('#')) {
    return null;
  }
  return { missionId, missionVersion, scoringPolicyVersion };
}

export function isMissionScopeKey(value: unknown): value is MissionScopeKey {
  return typeof value === 'string' && parseMissionScopeKey(value) !== null;
}
