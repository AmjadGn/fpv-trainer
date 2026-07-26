import { Injectable, inject } from '@angular/core';
import type { QualityTier } from '@fpv/location-domain';

import { MEDITERRANEAN_LOCATION_ID } from '../../../content/locations/mediterranean-expedition-region/identity';
import {
  PhysicsWorldService,
  type SuspendedEnvironmentCollisionHandle,
} from '../../physics/services/physics-world.service';
import { ThreeRendererService } from '../../rendering/services/three-renderer.service';
import type {
  LocationLoadFailure,
  LocationRuntimeHandle,
  LocationRuntimeInstallPort,
} from '../ports/location-definition-source.port';
import { LocationRuntimeDiagnosticsService } from '../services/location-runtime-diagnostics.service';
import { RapierCuratedLocationCollisionAdapter } from './rapier-curated-location-collision.adapter';
import { RapierMissionSpatialQueryAdapter } from './rapier-mission-spatial-query.adapter';
import {
  ThreeCuratedLocationSceneAdapter,
  type CuratedLocationVisualHandle,
} from './three-curated-location-scene.adapter';

/**
 * Atomic curated-location runtime install:
 * visuals + collisions + spatial queries, or full rollback including previous
 * trainer environment collision restoration.
 *
 * Ordering:
 * 1. Build proxy visuals (previous collisions remain active)
 * 2. Suspend previous non-drone collision bodies
 * 3. Install curated visuals / hide trainer visuals
 * 4. Install curated colliders + spatial queries
 * 5. Commit (retain suspension handle for unload restore)
 *
 * Unload ordering:
 * uninstall spatial → remove curated colliders → restore previous collisions
 * → dispose curated visuals → show trainer visuals → clear diagnostics
 */
@Injectable({ providedIn: 'root' })
export class CuratedLocationRuntimeInstallAdapter implements LocationRuntimeInstallPort {
  private readonly renderer = inject(ThreeRendererService);
  private readonly physicsWorld = inject(PhysicsWorldService);
  private readonly collision = inject(RapierCuratedLocationCollisionAdapter);
  private readonly spatial = inject(RapierMissionSpatialQueryAdapter);
  private readonly diagnostics = inject(LocationRuntimeDiagnosticsService);

  private readonly visualBuilder = new ThreeCuratedLocationSceneAdapter();
  private generation = 0;
  private activeHandleId: string | null = null;
  private visualHandle: CuratedLocationVisualHandle | null = null;
  private previousCollisionHandle: SuspendedEnvironmentCollisionHandle | null = null;

  async install(
    handleId: string,
    locationId: string,
    options?: { readonly signal?: AbortSignal; readonly qualityTier?: QualityTier },
  ): Promise<
    | { readonly ok: true; readonly handle: LocationRuntimeHandle }
    | { readonly ok: false; readonly failure: LocationLoadFailure }
  > {
    if (options?.signal?.aborted) {
      return {
        ok: false,
        failure: {
          code: 'LOCATION_LOAD_CANCELLED',
          message: 'Location install cancelled before start',
        },
      };
    }

    if (locationId !== MEDITERRANEAN_LOCATION_ID) {
      return {
        ok: false,
        failure: {
          code: 'LOCATION_PACKAGE_NOT_FOUND',
          message: `No curated runtime installer for "${locationId}"`,
          details: { locationId },
        },
      };
    }

    await this.unload(this.activeHandleId ?? handleId);

    const installGeneration = this.generation + 1;
    let visual: CuratedLocationVisualHandle | null = null;
    let suspended: SuspendedEnvironmentCollisionHandle | null = null;
    let curatedCollidersInstalled = false;

    try {
      const quality = options?.qualityTier ?? 'medium';

      // Visual preparation while previous collision runtime remains active.
      visual = this.visualBuilder.build(quality);
      if (options?.signal?.aborted) {
        this.visualBuilder.dispose(visual);
        return {
          ok: false,
          failure: {
            code: 'LOCATION_LOAD_CANCELLED',
            message: 'Location install cancelled after visual build',
          },
        };
      }

      const suspendResult = this.physicsWorld.suspendRegisteredBodiesKeepingDrone();
      if (!suspendResult.ok) {
        this.visualBuilder.dispose(visual);
        return {
          ok: false,
          failure: {
            code: 'LOCATION_COLLISION_BUILD_FAILED',
            message: `Failed to suspend previous environment collisions (${suspendResult.reason})`,
            details: { locationId, reason: suspendResult.reason },
          },
        };
      }
      suspended = suspendResult.handle;

      this.renderer.installCuratedLocationGroup(visual.root);
      this.renderer.setTrainerEnvironmentVisible(false);

      const collisionHandle = this.collision.install(locationId);
      if (!collisionHandle) {
        const restoreFailure = this.rollbackInstall(visual, suspended, false);
        if (restoreFailure) {
          return { ok: false, failure: restoreFailure };
        }
        return {
          ok: false,
          failure: {
            code: 'LOCATION_COLLISION_BUILD_FAILED',
            message: 'Failed to install curated location colliders',
            details: { locationId },
          },
        };
      }
      curatedCollidersInstalled = true;

      if (options?.signal?.aborted) {
        this.collision.unload();
        curatedCollidersInstalled = false;
        const restoreFailure = this.rollbackInstall(visual, suspended, false);
        if (restoreFailure) {
          return { ok: false, failure: restoreFailure };
        }
        return {
          ok: false,
          failure: {
            code: 'LOCATION_LOAD_CANCELLED',
            message: 'Location install cancelled after collision build',
          },
        };
      }

      this.spatial.install({
        locationGeneration: installGeneration,
      });

      if (!this.spatial.isAvailable()) {
        this.spatial.uninstall();
        this.collision.unload();
        curatedCollidersInstalled = false;
        const restoreFailure = this.rollbackInstall(visual, suspended, false);
        if (restoreFailure) {
          return { ok: false, failure: restoreFailure };
        }
        return {
          ok: false,
          failure: {
            code: 'LOCATION_QUERY_INSTALL_FAILED',
            message: 'Spatial query adapter failed to become available',
            details: { locationId },
          },
        };
      }

      // Stale completion rejection
      if (installGeneration !== this.generation + 1) {
        this.spatial.uninstall();
        this.collision.unload();
        curatedCollidersInstalled = false;
        const restoreFailure = this.rollbackInstall(visual, suspended, false);
        if (restoreFailure) {
          return { ok: false, failure: restoreFailure };
        }
        return {
          ok: false,
          failure: {
            code: 'STALE_LOCATION_GENERATION',
            message: 'Stale location install completion rejected',
            details: { installGeneration, current: this.generation },
          },
        };
      }

      this.generation = installGeneration;
      this.activeHandleId = handleId;
      this.visualHandle = visual;
      this.previousCollisionHandle = suspended;
      this.diagnostics.set({
        visualObjectCount: visual.diagnostics.visualObjectCount,
        geometryCount: visual.diagnostics.geometryCount,
        materialCount: visual.diagnostics.materialCount,
        textureCount: visual.diagnostics.textureCount,
        colliderCount: collisionHandle.colliderCount,
        spatialQueryReady: true,
        locationGeneration: this.generation,
        packageId: locationId,
        packageVersion: '1.0.0',
        qualityTier: quality,
      });

      return {
        ok: true,
        handle: {
          handleId,
          locationId,
          locationGeneration: this.generation,
          installed: true,
        },
      };
    } catch (err) {
      this.spatial.uninstall();
      if (curatedCollidersInstalled) {
        this.collision.unload();
      }
      const restoreFailure = this.rollbackInstall(visual, suspended, false);
      if (restoreFailure) {
        return { ok: false, failure: restoreFailure };
      }
      return {
        ok: false,
        failure: {
          code: 'LOCATION_VISUAL_BUILD_FAILED',
          message: err instanceof Error ? err.message : 'Curated location visual build failed',
          details: { locationId },
        },
      };
    }
  }

  async unload(_handleId: string): Promise<void> {
    try {
      this.spatial.uninstall();
      this.collision.unload();

      if (this.previousCollisionHandle) {
        const restore = this.physicsWorld.restoreSuspendedBodies(
          this.previousCollisionHandle,
        );
        if (!restore.ok) {
          if (restore.reason !== 'already-restored') {
            const message = `LOCATION_PREVIOUS_COLLISION_RESTORE_FAILED: ${restore.message}`;
            this.previousCollisionHandle = null;
            this.generation += 1;
            this.activeHandleId = null;
            throw new Error(message);
          }
        }
        this.previousCollisionHandle = null;
      }

      this.renderer.uninstallCuratedLocationGroup();
      if (this.visualHandle) {
        this.visualBuilder.dispose(this.visualHandle);
        this.visualHandle = null;
      }
      this.renderer.setTrainerEnvironmentVisible(true);
      this.activeHandleId = null;
      this.generation += 1;
      this.diagnostics.clear();
    } catch (err) {
      this.generation += 1;
      this.activeHandleId = null;
      this.previousCollisionHandle = null;
      throw err;
    }
  }

  currentGeneration(): number {
    return this.generation;
  }

  /** Test seam: whether a previous-environment suspension is retained after commit. */
  hasRetainedPreviousCollisionHandle(): boolean {
    return this.previousCollisionHandle !== null;
  }

  /**
   * Failure/cancel path: restore suspended collisions, dispose curated visuals,
   * re-show trainer visuals. Returns a restore failure when restoration fails.
   */
  private rollbackInstall(
    visual: CuratedLocationVisualHandle | null,
    suspended: SuspendedEnvironmentCollisionHandle | null,
    _curatedInstalled: boolean,
  ): LocationLoadFailure | null {
    let restoreFailure: LocationLoadFailure | null = null;
    if (suspended) {
      const restore = this.physicsWorld.restoreSuspendedBodies(suspended);
      if (!restore.ok && restore.reason !== 'already-restored') {
        restoreFailure = {
          code: 'LOCATION_PREVIOUS_COLLISION_RESTORE_FAILED',
          message: restore.message,
          details: { reason: restore.reason, failedBodyId: restore.failedBodyId ?? null },
        };
      }
    }

    this.renderer.uninstallCuratedLocationGroup();
    if (visual) {
      this.visualBuilder.dispose(visual);
    }
    this.renderer.setTrainerEnvironmentVisible(true);
    return restoreFailure;
  }
}
