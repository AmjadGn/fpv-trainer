import type { Vec3 } from '@fpv/simulation-contracts';

/**
 * Application-facing spatial query contract for future mission photography
 * line-of-sight / obstruction checks. Plain DTOs only — no Rapier/Three types.
 */

export type MissionSpatialQueryFilterCategory =
  | 'static-environment'
  | 'terrain'
  | 'subject-geometry'
  | 'drone'
  | 'sensors'
  | 'dynamic-props'
  | 'decorative-non-authoritative';

export interface MissionSpatialQueryFilter {
  readonly include?: readonly MissionSpatialQueryFilterCategory[];
  readonly exclude?: readonly MissionSpatialQueryFilterCategory[];
}

export interface MissionLineOfSightQuery {
  readonly startWorld: Vec3;
  readonly endWorld: Vec3;
  readonly filter?: MissionSpatialQueryFilter;
  /**
   * When set, only colliders authored for this photography subject are ignored
   * (target endpoint / self-geometry). Other subject geometry still obstructs.
   * Prefer this over the legacy subjectId alias.
   */
  readonly targetSubjectId?: string;
  /** @deprecated Prefer targetSubjectId. Kept as a compatibility alias. */
  readonly subjectId?: string;
  readonly queryReferenceId?: string;
  readonly expectedLocationGeneration?: number;
  readonly expectedSessionGeneration?: number;
}

export interface MissionSegmentObstructionQuery {
  readonly startWorld: Vec3;
  readonly endWorld: Vec3;
  readonly filter?: MissionSpatialQueryFilter;
  /**
   * Optional explicit target exclusion. Segment queries include subject geometry
   * by default; a matching targetSubjectId is ignored only when supplied.
   */
  readonly targetSubjectId?: string;
  readonly expectedLocationGeneration?: number;
  readonly expectedSessionGeneration?: number;
}

export interface MissionVisibilitySampleQuery {
  readonly originWorld: Vec3;
  readonly samplePointsWorld: readonly Vec3[];
  readonly filter?: MissionSpatialQueryFilter;
  readonly targetSubjectId?: string;
  readonly subjectId?: string;
  readonly expectedLocationGeneration?: number;
  readonly expectedSessionGeneration?: number;
}

export type MissionSpatialQueryStatus =
  | 'ok'
  | 'unavailable'
  | 'stale-session'
  | 'invalid-input';

export type MissionObstructionCategory =
  | 'static-environment'
  | 'terrain'
  | 'subject-geometry'
  | 'drone'
  | 'sensors'
  | 'dynamic-props'
  | 'decorative-non-authoritative'
  | 'unknown';

export interface MissionLineOfSightResult {
  readonly status: MissionSpatialQueryStatus;
  /** Only meaningful when status === 'ok'. Never invent "clear" when unavailable. */
  readonly unobstructed: boolean | null;
  readonly firstHitDistanceMeters: number | null;
  readonly obstructionCategory: MissionObstructionCategory | null;
  readonly diagnosticCode?: 'SPATIAL_QUERY_UNAVAILABLE' | 'STALE_RUNTIME_SESSION';
  readonly diagnosticMessage?: string;
}

export interface MissionSegmentObstructionResult {
  readonly status: MissionSpatialQueryStatus;
  readonly obstructed: boolean | null;
  readonly firstHitDistanceMeters: number | null;
  readonly obstructionCategory: MissionObstructionCategory | null;
  readonly diagnosticCode?: 'SPATIAL_QUERY_UNAVAILABLE' | 'STALE_RUNTIME_SESSION';
  readonly diagnosticMessage?: string;
}

export interface MissionVisibilitySampleResult {
  readonly status: MissionSpatialQueryStatus;
  /** Fraction of samples with clear LOS; null when infrastructure unavailable. */
  readonly visibleFraction: number | null;
  readonly sampleCount: number;
  readonly diagnosticCode?: 'SPATIAL_QUERY_UNAVAILABLE' | 'STALE_RUNTIME_SESSION';
  readonly diagnosticMessage?: string;
}

export interface MissionSpatialQueryPort {
  queryLineOfSight(query: MissionLineOfSightQuery): MissionLineOfSightResult;
  querySegmentObstructions(
    query: MissionSegmentObstructionQuery,
  ): MissionSegmentObstructionResult;
  queryVisibilitySamples(
    query: MissionVisibilitySampleQuery,
  ): MissionVisibilitySampleResult;
  isAvailable(): boolean;
}
