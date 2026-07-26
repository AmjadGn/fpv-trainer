import { Injectable, inject } from '@angular/core';

import {
  buildCoastalRuinsCollisionDescriptors,
  type CuratedColliderCategory,
  type CuratedCollisionDescriptor,
} from '../../../content/locations/mediterranean-expedition-region/collision-descriptors';
import { MEDITERRANEAN_LOCATION_ID } from '../../../content/locations/mediterranean-expedition-region/identity';
import { PhysicsWorldService } from '../../physics/services/physics-world.service';
import type { MissionSpatialQueryFilterCategory } from '../ports/mission-spatial-query.port';

export interface CuratedLocationCollisionHandle {
  readonly locationId: string;
  readonly bodyIds: readonly string[];
  readonly colliderCount: number;
  readonly categoryByBodyId: ReadonlyMap<string, CuratedColliderCategory>;
}

/**
 * Installs Coastal Ruins static colliders into the existing Rapier world.
 * Does not create a second world and does not step physics.
 */
@Injectable({ providedIn: 'root' })
export class RapierCuratedLocationCollisionAdapter {
  private readonly world = inject(PhysicsWorldService);

  private ownedBodyIds: string[] = [];
  private categoryByBodyId = new Map<string, CuratedColliderCategory>();
  private categoryByColliderHandle = new Map<number, CuratedColliderCategory>();
  private installed = false;

  buildDescriptors(locationId: string): readonly CuratedCollisionDescriptor[] {
    if (locationId !== MEDITERRANEAN_LOCATION_ID) {
      return [];
    }
    return buildCoastalRuinsCollisionDescriptors();
  }

  install(locationId: string): CuratedLocationCollisionHandle | null {
    this.unload();
    if (!this.world.isInitialized()) {
      return null;
    }
    const descriptors = this.buildDescriptors(locationId);
    if (descriptors.length === 0) {
      return null;
    }

    const bodyIds: string[] = [];
    for (const desc of descriptors) {
      const registered = this.world.registerBody(desc.definition);
      if (!registered) {
        // Atomic failure: roll back what we created.
        this.unload();
        return null;
      }
      bodyIds.push(registered.id);
      this.ownedBodyIds.push(registered.id);
      this.categoryByBodyId.set(registered.id, desc.category);
      for (const col of registered.colliders) {
        this.categoryByColliderHandle.set(col.handle, desc.category);
      }
    }

    this.installed = true;
    return {
      locationId,
      bodyIds,
      colliderCount: bodyIds.length,
      categoryByBodyId: new Map(this.categoryByBodyId),
    };
  }

  unload(): void {
    for (const id of [...this.ownedBodyIds]) {
      this.world.removeBody(id);
    }
    this.ownedBodyIds = [];
    this.categoryByBodyId.clear();
    this.categoryByColliderHandle.clear();
    this.installed = false;
  }

  isInstalled(): boolean {
    return this.installed;
  }

  ownedIds(): readonly string[] {
    return this.ownedBodyIds;
  }

  categoryForColliderHandle(handle: number): CuratedColliderCategory | null {
    return this.categoryByColliderHandle.get(handle) ?? null;
  }

  toSpatialCategory(
    category: CuratedColliderCategory,
  ): MissionSpatialQueryFilterCategory {
    switch (category) {
      case 'terrain':
        return 'terrain';
      case 'static-environment':
      case 'boundary-protection':
        return 'static-environment';
      case 'subject-geometry':
        return 'subject-geometry';
      case 'decorative-non-authoritative':
        return 'decorative-non-authoritative';
      case 'mission-sensor':
        return 'sensors';
      default:
        return 'static-environment';
    }
  }
}
