import { Injectable, inject } from '@angular/core';
import type { Vec3 } from '@fpv/simulation-contracts';

import { PhysicsWorldService } from '../../physics/services/physics-world.service';
import type {
  MissionLineOfSightQuery,
  MissionLineOfSightResult,
  MissionObstructionCategory,
  MissionSegmentObstructionQuery,
  MissionSegmentObstructionResult,
  MissionSpatialQueryFilter,
  MissionSpatialQueryFilterCategory,
  MissionSpatialQueryPort,
  MissionVisibilitySampleQuery,
  MissionVisibilitySampleResult,
} from '../ports/mission-spatial-query.port';
import { RapierCuratedLocationCollisionAdapter } from './rapier-curated-location-collision.adapter';

const DEFAULT_LOS_INCLUDE: readonly MissionSpatialQueryFilterCategory[] = [
  'terrain',
  'static-environment',
  'subject-geometry',
  'dynamic-props',
];

const DEFAULT_LOS_EXCLUDE: readonly MissionSpatialQueryFilterCategory[] = [
  'drone',
  'sensors',
  'decorative-non-authoritative',
];

/**
 * Rapier-backed mission spatial queries.
 * Never returns "clear" when infrastructure is unavailable or stale.
 * Does not expose Rapier handles through the port.
 */
@Injectable({ providedIn: 'root' })
export class RapierMissionSpatialQueryAdapter implements MissionSpatialQueryPort {
  private readonly worldService = inject(PhysicsWorldService);
  private readonly collision = inject(RapierCuratedLocationCollisionAdapter);

  private locationGeneration = 0;
  private installed = false;
  private subjectColliderBodyIds = new Set<string>();

  install(options: {
    readonly locationGeneration: number;
    readonly subjectBodyIds?: readonly string[];
  }): void {
    this.locationGeneration = options.locationGeneration;
    this.subjectColliderBodyIds = new Set(options.subjectBodyIds ?? []);
    this.installed = this.collision.isInstalled() && this.worldService.isInitialized();
  }

  uninstall(): void {
    this.installed = false;
    this.subjectColliderBodyIds.clear();
    this.locationGeneration = 0;
  }

  isAvailable(): boolean {
    return (
      this.installed &&
      this.collision.isInstalled() &&
      this.worldService.isInitialized() &&
      this.worldService.getWorld() !== null
    );
  }

  queryLineOfSight(query: MissionLineOfSightQuery): MissionLineOfSightResult {
    const gate = this.gate(query);
    if (gate) {
      return {
        status: gate.status,
        unobstructed: null,
        firstHitDistanceMeters: null,
        obstructionCategory: null,
        diagnosticCode: gate.code,
        diagnosticMessage: gate.message,
      };
    }
    if (!this.isFiniteSegment(query.startWorld, query.endWorld)) {
      return {
        status: 'invalid-input',
        unobstructed: null,
        firstHitDistanceMeters: null,
        obstructionCategory: null,
        diagnosticMessage: 'Line-of-sight query requires finite start/end',
      };
    }

    const hit = this.castFirstHit(query.startWorld, query.endWorld, query.filter, {
      ignoreSubjectGeometry: true,
      ignoreDrone: true,
    });
    if (!hit) {
      return {
        status: 'ok',
        unobstructed: true,
        firstHitDistanceMeters: null,
        obstructionCategory: null,
      };
    }
    return {
      status: 'ok',
      unobstructed: false,
      firstHitDistanceMeters: hit.distance,
      obstructionCategory: hit.category,
    };
  }

  querySegmentObstructions(
    query: MissionSegmentObstructionQuery,
  ): MissionSegmentObstructionResult {
    const gate = this.gate(query);
    if (gate) {
      return {
        status: gate.status,
        obstructed: null,
        firstHitDistanceMeters: null,
        obstructionCategory: null,
        diagnosticCode: gate.code,
        diagnosticMessage: gate.message,
      };
    }
    if (!this.isFiniteSegment(query.startWorld, query.endWorld)) {
      return {
        status: 'invalid-input',
        obstructed: null,
        firstHitDistanceMeters: null,
        obstructionCategory: null,
        diagnosticMessage: 'Segment obstruction query requires finite start/end',
      };
    }

    const hit = this.castFirstHit(query.startWorld, query.endWorld, query.filter, {
      ignoreSubjectGeometry: false,
      ignoreDrone: true,
    });
    if (!hit) {
      return {
        status: 'ok',
        obstructed: false,
        firstHitDistanceMeters: null,
        obstructionCategory: null,
      };
    }
    return {
      status: 'ok',
      obstructed: true,
      firstHitDistanceMeters: hit.distance,
      obstructionCategory: hit.category,
    };
  }

  queryVisibilitySamples(
    query: MissionVisibilitySampleQuery,
  ): MissionVisibilitySampleResult {
    const gate = this.gate(query);
    if (gate) {
      return {
        status: gate.status,
        visibleFraction: null,
        sampleCount: query.samplePointsWorld.length,
        diagnosticCode: gate.code,
        diagnosticMessage: gate.message,
      };
    }
    if (!this.isFiniteVec3(query.originWorld)) {
      return {
        status: 'invalid-input',
        visibleFraction: null,
        sampleCount: query.samplePointsWorld.length,
        diagnosticMessage: 'Visibility sample origin must be finite',
      };
    }

    const samples = query.samplePointsWorld;
    if (samples.length === 0) {
      return {
        status: 'ok',
        visibleFraction: 0,
        sampleCount: 0,
      };
    }

    let visible = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]!;
      if (!this.isFiniteVec3(sample)) {
        return {
          status: 'invalid-input',
          visibleFraction: null,
          sampleCount: samples.length,
          diagnosticMessage: `Visibility sample[${i}] is not finite`,
        };
      }
      const hit = this.castFirstHit(query.originWorld, sample, query.filter, {
        ignoreSubjectGeometry: true,
        ignoreDrone: true,
      });
      if (!hit) {
        visible += 1;
      }
    }

    return {
      status: 'ok',
      visibleFraction: visible / samples.length,
      sampleCount: samples.length,
    };
  }

  private gate(query: {
    readonly expectedLocationGeneration?: number;
    readonly expectedSessionGeneration?: number;
  }): {
    status: 'unavailable' | 'stale-session';
    code: 'SPATIAL_QUERY_UNAVAILABLE' | 'STALE_RUNTIME_SESSION';
    message: string;
  } | null {
    if (!this.isAvailable()) {
      return {
        status: 'unavailable',
        code: 'SPATIAL_QUERY_UNAVAILABLE',
        message: 'Mission spatial query runtime is not installed or Rapier world is not ready',
      };
    }
    if (
      query.expectedLocationGeneration !== undefined &&
      query.expectedLocationGeneration !== this.locationGeneration
    ) {
      return {
        status: 'stale-session',
        code: 'STALE_RUNTIME_SESSION',
        message: `Stale location generation: expected ${query.expectedLocationGeneration}, active ${this.locationGeneration}`,
      };
    }
    return null;
  }

  private castFirstHit(
    start: Vec3,
    end: Vec3,
    filter: MissionSpatialQueryFilter | undefined,
    options: { ignoreSubjectGeometry: boolean; ignoreDrone: boolean },
  ): { distance: number; category: MissionObstructionCategory } | null {
    const world = this.worldService.getWorld();
    const R = this.worldService.getRapier();
    if (!world || !R) {
      return null;
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dy, dz);
    if (!(length > 1e-6)) {
      return null;
    }
    const dir = { x: dx / length, y: dy / length, z: dz / length };
    const ray = new R.Ray(start, dir);

    const include = new Set(filter?.include ?? DEFAULT_LOS_INCLUDE);
    const exclude = new Set([
      ...(filter?.exclude ?? DEFAULT_LOS_EXCLUDE),
      ...(options.ignoreDrone ? (['drone'] as const) : []),
      ...(options.ignoreSubjectGeometry ? (['subject-geometry'] as const) : []),
    ]);

    const droneBody = this.worldService.getDroneBody();

    // Collect hits via intersectionsWithRay for stable ordering by toi.
    const hits: Array<{ toi: number; category: MissionObstructionCategory }> = [];
    world.intersectionsWithRay(
      ray,
      length,
      true,
      (intersect) => {
        const collider = intersect.collider;
        if (!collider) {
          return true;
        }
        if (droneBody && collider.parent()?.handle === droneBody.handle) {
          return true;
        }
        const body = this.worldService.findBodyByColliderHandle(collider.handle);
        const curatedCategory = this.collision.categoryForColliderHandle(collider.handle);
        let spatialCategory: MissionSpatialQueryFilterCategory;
        if (curatedCategory) {
          spatialCategory = this.collision.toSpatialCategory(curatedCategory);
        } else if (body) {
          spatialCategory = this.inferCategoryFromBodyId(body.id);
        } else {
          spatialCategory = 'static-environment';
        }

        if (exclude.has(spatialCategory)) {
          return true;
        }
        if (!include.has(spatialCategory)) {
          return true;
        }

        hits.push({
          toi: intersect.timeOfImpact,
          category: spatialCategory as MissionObstructionCategory,
        });
        return true;
      },
      undefined,
      undefined,
      undefined,
      droneBody ?? undefined,
    );

    if (hits.length === 0) {
      return null;
    }
    hits.sort((a, b) => a.toi - b.toi || a.category.localeCompare(b.category));
    const first = hits[0]!;
    return { distance: first.toi, category: first.category };
  }

  private inferCategoryFromBodyId(id: string): MissionSpatialQueryFilterCategory {
    if (id.includes('terrain') || id.includes('ground') || id.includes('heightfield')) {
      return 'terrain';
    }
    if (id.includes('sensor') || id.includes('gate')) {
      return 'sensors';
    }
    if (id.includes('decor')) {
      return 'decorative-non-authoritative';
    }
    if (id.includes('prop') || id.includes('dynamic')) {
      return 'dynamic-props';
    }
    return 'static-environment';
  }

  private isFiniteSegment(a: Vec3, b: Vec3): boolean {
    return this.isFiniteVec3(a) && this.isFiniteVec3(b);
  }

  private isFiniteVec3(v: Vec3): boolean {
    return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  }
}
