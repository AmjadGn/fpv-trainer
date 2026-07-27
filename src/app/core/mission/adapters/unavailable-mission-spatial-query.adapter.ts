import { Injectable } from '@angular/core';

import type {
  MissionLineOfSightQuery,
  MissionLineOfSightResult,
  MissionSegmentObstructionQuery,
  MissionSegmentObstructionResult,
  MissionSpatialQueryPort,
  MissionVisibilitySampleQuery,
  MissionVisibilitySampleResult,
} from '../ports/mission-spatial-query.port';

const UNAVAILABLE_MSG =
  'Mission spatial query infrastructure is not available in this build';

/**
 * Deterministic null/unavailable adapter.
 * Never treats "query unavailable" as "line of sight clear".
 */
@Injectable({ providedIn: 'root' })
export class UnavailableMissionSpatialQueryAdapter implements MissionSpatialQueryPort {
  isAvailable(): boolean {
    return false;
  }

  queryLineOfSight(_query: MissionLineOfSightQuery): MissionLineOfSightResult {
    return {
      status: 'unavailable',
      unobstructed: null,
      firstHitDistanceMeters: null,
      obstructionCategory: null,
      diagnosticCode: 'SPATIAL_QUERY_UNAVAILABLE',
      diagnosticMessage: UNAVAILABLE_MSG,
    };
  }

  querySegmentObstructions(
    _query: MissionSegmentObstructionQuery,
  ): MissionSegmentObstructionResult {
    return {
      status: 'unavailable',
      obstructed: null,
      firstHitDistanceMeters: null,
      obstructionCategory: null,
      diagnosticCode: 'SPATIAL_QUERY_UNAVAILABLE',
      diagnosticMessage: UNAVAILABLE_MSG,
    };
  }

  queryVisibilitySamples(
    query: MissionVisibilitySampleQuery,
  ): MissionVisibilitySampleResult {
    return {
      status: 'unavailable',
      visibleFraction: null,
      visibleSampleCount: null,
      totalSampleCount: query.samplePointsWorld.length,
      sampleCount: query.samplePointsWorld.length,
      diagnosticCode: 'SPATIAL_QUERY_UNAVAILABLE',
      diagnosticMessage: UNAVAILABLE_MSG,
    };
  }
}

/**
 * Skeleton Rapier capability probe — does not perform queries.
 * Exists so Checkpoint 4 can replace the unavailable adapter without
 * changing the port surface.
 */
@Injectable({ providedIn: 'root' })
export class RapierMissionSpatialQuerySkeleton {
  probeCapability(): {
    readonly available: false;
    readonly reason: 'SPATIAL_QUERY_UNAVAILABLE';
    readonly message: string;
  } {
    return {
      available: false,
      reason: 'SPATIAL_QUERY_UNAVAILABLE',
      message:
        'Rapier mission spatial queries are not wired in Checkpoint 3; capability probe only',
    };
  }
}
