import { Injectable, inject, signal } from '@angular/core';

import type { Quat, Vec3 } from '../../flight/models/flight-state.model';
import {
  CollisionGroup,
  DYNAMIC_PROP_COLLIDES_WITH,
} from '../models/collision-groups';
import type {
  CollisionMaterialId,
  DynamicPropProperties,
  EnvironmentColliderDefinition,
} from '../models/collision.models';
import { PhysicsWorldService } from './physics-world.service';

export interface DynamicPropVisualSync {
  id: string;
  position: Vec3;
  rotation: Quat;
  broken: boolean;
}

export interface BreakablePropEvent {
  id: string;
  position: Vec3;
  material: CollisionMaterialId;
  timestampMs: number;
}

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Manages dynamic / breakable props inside the shared Rapier world.
 * Caps active bodies; uses sleeping; debris auto-cleans.
 */
@Injectable({ providedIn: 'root' })
export class DynamicPropPhysicsService {
  private readonly world = inject(PhysicsWorldService);

  private readonly brokenIds = new Set<string>();
  private readonly debrisExpiry = new Map<string, number>();
  private debrisLifetimeMs = 4000;
  private simTimeMs = 0;

  private readonly _breakEvents = signal<BreakablePropEvent[]>([]);
  private readonly _visualSync = signal<DynamicPropVisualSync[]>([]);

  readonly breakEvents = this._breakEvents.asReadonly();
  readonly visualSync = this._visualSync.asReadonly();

  setDebrisLifetimeMs(ms: number): void {
    this.debrisLifetimeMs = Math.max(500, ms);
  }

  clearBreakEvents(): void {
    this._breakEvents.set([]);
  }

  /**
   * Register a dynamic prop from an environment collider definition.
   */
  spawnProp(def: EnvironmentColliderDefinition): boolean {
    if (def.bodyType !== 'dynamic') {
      return false;
    }
    const registered = this.world.registerBody(def);
    return !!registered;
  }

  /**
   * Called each fixed step after world.step to sync visuals + handle breaks.
   */
  afterPhysicsStep(
    dt: number,
    impactHints?: Array<{ objectId: string; impulse: number }>,
  ): void {
    this.simTimeMs += dt * 1000;

    if (impactHints) {
      for (const hint of impactHints) {
        this.tryBreak(hint.objectId, hint.impulse);
      }
    }

    // Expire debris.
    for (const [id, expiry] of [...this.debrisExpiry.entries()]) {
      if (this.simTimeMs >= expiry) {
        this.world.removeBody(id);
        this.debrisExpiry.delete(id);
      }
    }

    this.publishVisualSync();
  }

  tryBreak(objectId: string, impulse: number): boolean {
    if (this.brokenIds.has(objectId)) {
      return false;
    }
    const body = this.world.getBody(objectId);
    if (!body || !body.isDynamic || body.isDebris) {
      return false;
    }
    const props = body.definition.dynamicProperties;
    const threshold = props?.breakThreshold;
    if (threshold == null || !(impulse >= threshold)) {
      return false;
    }

    const pos = body.body.translation();
    const material = body.definition.material;
    this.brokenIds.add(objectId);
    this.world.removeBody(objectId);

    this._breakEvents.set([
      ...this._breakEvents(),
      {
        id: objectId,
        position: { x: pos.x, y: pos.y, z: pos.z },
        material,
        timestampMs: this.simTimeMs,
      },
    ]);

    this.spawnDebris(objectId, { x: pos.x, y: pos.y, z: pos.z }, material);
    return true;
  }

  resetAll(): void {
    this.brokenIds.clear();
    for (const id of [...this.debrisExpiry.keys()]) {
      this.world.removeBody(id);
    }
    this.debrisExpiry.clear();
    this.world.resetDynamicProps();
    this._breakEvents.set([]);
    this.simTimeMs = 0;
    this.publishVisualSync();
  }

  private spawnDebris(
    parentId: string,
    position: Vec3,
    material: CollisionMaterialId,
  ): void {
    const offsets: Vec3[] = [
      { x: 0.08, y: 0.05, z: 0.04 },
      { x: -0.06, y: 0.04, z: -0.05 },
      { x: 0.02, y: 0.08, z: -0.07 },
    ];
    let i = 0;
    for (const off of offsets) {
      if (
        [...this.world.getAllBodies()].filter((b) => b.isDebris).length >=
        this.world.getMaxDebris()
      ) {
        break;
      }
      const id = `${parentId}:debris:${i++}`;
      const dyn: DynamicPropProperties = {
        mass: 0.15,
        friction: 0.5,
        restitution: 0.1,
        linearDamping: 0.8,
        angularDamping: 0.9,
        breakThreshold: null,
        impactSoundCategory: material,
        canSleep: true,
        propKind: 'debris',
      };
      const def: EnvironmentColliderDefinition = {
        id,
        objectId: id,
        bodyType: 'dynamic',
        shape: {
          kind: 'box',
          halfExtents: { x: 0.04, y: 0.03, z: 0.05 },
        },
        position: {
          x: position.x + off.x,
          y: position.y + off.y,
          z: position.z + off.z,
        },
        rotation: { ...IDENTITY },
        material,
        collisionGroup: CollisionGroup.DYNAMIC_PROP,
        collidesWith: DYNAMIC_PROP_COLLIDES_WITH,
        dynamicProperties: dyn,
      };
      const reg = this.world.registerBody(def, { isDebris: true });
      if (reg) {
        try {
          reg.body.setLinvel(
            { x: off.x * 8, y: 2 + off.y * 10, z: off.z * 8 },
            true,
          );
        } catch {
          /* ignore */
        }
        this.debrisExpiry.set(id, this.simTimeMs + this.debrisLifetimeMs);
      }
    }
  }

  private publishVisualSync(): void {
    const sync: DynamicPropVisualSync[] = [];
    for (const b of this.world.getAllBodies()) {
      if (!b.isDynamic) {
        continue;
      }
      try {
        const t = b.body.translation();
        const r = b.body.rotation();
        sync.push({
          id: b.id,
          position: { x: t.x, y: t.y, z: t.z },
          rotation: { x: r.x, y: r.y, z: r.z, w: r.w },
          broken: this.brokenIds.has(b.id),
        });
      } catch {
        /* ignore removed bodies */
      }
    }
    // Include broken markers for visuals that need to hide meshes.
    for (const id of this.brokenIds) {
      if (!sync.some((s) => s.id === id)) {
        sync.push({
          id,
          position: { x: 0, y: -100, z: 0 },
          rotation: { ...IDENTITY },
          broken: true,
        });
      }
    }
    this._visualSync.set(sync);
  }
}
