import { Injectable } from '@angular/core';

import type { CollisionMaterialId } from '../models/collision.models';
import {
  COLLISION_MATERIALS,
  getCollisionMaterial,
  type CollisionMaterialProfile,
} from '../models/physics-body.models';

/**
 * Lookup service for collision material profiles.
 * Shared materials only — never one material per mesh.
 */
@Injectable({ providedIn: 'root' })
export class CollisionMaterialService {
  get(id: CollisionMaterialId | string | undefined): CollisionMaterialProfile {
    return getCollisionMaterial(id);
  }

  all(): readonly CollisionMaterialProfile[] {
    return Object.values(COLLISION_MATERIALS);
  }
}
