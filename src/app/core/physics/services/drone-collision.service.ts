import { Injectable, inject, signal } from '@angular/core';
import type RAPIER from '@dimforge/rapier3d-compat';

import { buildAircraftColliders } from '../../aircraft/factories/aircraft-collider.factory';
import type { CollisionProfile } from '../../aircraft/models/collision-profile.model';
import type { Quat, Vec3 } from '../../flight/models/flight-state.model';
import {
  CollisionGroup,
  DRONE_COLLIDES_WITH,
  interactionGroups,
} from '../models/collision-groups';
import type {
  CollisionCorrection,
  CollisionMaterialId,
  DroneDamageState,
} from '../models/collision.models';
import { DEFAULT_IMPACT_THRESHOLDS } from '../models/collision.models';
import {
  damageStateFromAccumulated,
  resolveCollisionResponse,
  type RawCollisionHit,
} from '../utils/collision-response';
import { PhysicsWorldService } from './physics-world.service';

export interface DroneCollisionSyncState {
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
  angularVelocity: { pitch: number; yaw: number; roll: number };
  armed: boolean;
  crashed: boolean;
  timestampMs: number;
  competitive?: boolean;
}

/** Query ball radius approximating the compound drone for reliable sweeps. */
const QUERY_RADIUS = 0.32;

/**
 * Hybrid drone ↔ Rapier bridge.
 *
 * Uses shape-cast + intersection queries (not only contact manifolds).
 * Kinematic contactPairsWith alone was missing most structure hits.
 */
@Injectable({ providedIn: 'root' })
export class DroneCollisionService {
  private readonly world = inject(PhysicsWorldService);

  private damageAccum = 0;
  private readonly _damageState = signal<DroneDamageState>('pristine');
  private readonly _lastCorrection = signal<CollisionCorrection | null>(null);
  private colliderUserData = new Map<
    number,
    {
      objectId: string;
      material: CollisionMaterialId;
      isWater?: boolean;
      isGroundLike?: boolean;
      damageMultiplier?: number;
      sensor?: boolean;
    }
  >();

  private prevPos: Vec3 = { x: 0, y: 1, z: 0 };
  private hasPrev = false;
  private queryShape: RAPIER.Ball | null = null;
  private activeCollisionProfile: CollisionProfile | null = null;

  readonly damageState = this._damageState.asReadonly();
  readonly lastCorrection = this._lastCorrection.asReadonly();

  resetDamage(): void {
    this.damageAccum = 0;
    this._damageState.set('pristine');
    this._lastCorrection.set(null);
    this.hasPrev = false;
  }

  getDamageAccumulated(): number {
    return this.damageAccum;
  }

  registerColliderMeta(
    handle: number,
    meta: {
      objectId: string;
      material: CollisionMaterialId;
      isWater?: boolean;
      isGroundLike?: boolean;
      damageMultiplier?: number;
      sensor?: boolean;
    },
  ): void {
    this.colliderUserData.set(handle, meta);
  }

  clearColliderMeta(): void {
    this.colliderUserData.clear();
  }

  ensureDroneBody(collisionProfile?: CollisionProfile | null): boolean {
    const R = this.world.getRapier();
    const rapierWorld = this.world.getWorld();
    if (!R || !rapierWorld) {
      return false;
    }

    const existing = this.world.getDroneBody();
    if (existing) {
      this.world.setDroneBody(null, []);
    }

    if (collisionProfile) {
      this.activeCollisionProfile = collisionProfile;
    }

    const rbDesc = R.RigidBodyDesc.kinematicPositionBased().setTranslation(
      0,
      1,
      0,
    );
    const body = rapierWorld.createRigidBody(rbDesc);
    const groups = interactionGroups(CollisionGroup.DRONE, DRONE_COLLIDES_WITH);

    const built = buildAircraftColliders(
      R,
      rapierWorld,
      body,
      this.activeCollisionProfile,
      (desc) =>
        desc
          .setCollisionGroups(groups)
          .setSolverGroups(groups)
          .setActiveEvents(
            R.ActiveEvents.COLLISION_EVENTS | R.ActiveEvents.CONTACT_FORCE_EVENTS,
          ),
      (col, tag) => {
        this.registerColliderMeta(col.handle, {
          objectId: `drone:${tag}`,
          material: 'droneCarbon',
          damageMultiplier: this.activeCollisionProfile?.damageMultiplier,
        });
      },
    );

    this.queryShape = new R.Ball(built.queryRadius || QUERY_RADIUS);
    this.world.setDroneBody(body, built.colliders);
    this.hasPrev = false;
    return true;
  }

  processFixedStep(state: DroneCollisionSyncState): CollisionCorrection | null {
    if (!this.world.isEnabled() || state.crashed) {
      return null;
    }

    const body = this.world.getDroneBody();
    const rapierWorld = this.world.getWorld();
    if (!body || !rapierWorld) {
      return null;
    }

    if (!this.hasPrev) {
      this.prevPos = { ...state.position };
      this.hasPrev = true;
    }

    try {
      body.setNextKinematicTranslation(state.position);
      body.setNextKinematicRotation(state.orientation);
    } catch {
      return null;
    }

    // Step dynamics (props); queries below do not rely on kinematic manifolds.
    this.world.step();

    const hits = this.queryHits(state, body);
    this.prevPos = { ...state.position };

    if (hits.length === 0) {
      const empty: CollisionCorrection = {
        position: { ...state.position },
        velocity: { ...state.velocity },
        angularVelocity: { ...state.angularVelocity },
        outcome: 'none',
        crash: false,
        events: [],
        damageDelta: 0,
      };
      this._lastCorrection.set(empty);
      return empty;
    }

    const correction = resolveCollisionResponse({
      position: state.position,
      velocity: state.velocity,
      orientation: state.orientation,
      angularVelocity: state.angularVelocity,
      hits,
      armed: state.armed,
      thresholds: DEFAULT_IMPACT_THRESHOLDS,
      competitive: state.competitive,
    });

    if (correction.damageDelta > 0) {
      this.damageAccum += correction.damageDelta;
      this._damageState.set(
        damageStateFromAccumulated(this.damageAccum) as DroneDamageState,
      );
    }
    if (correction.crash) {
      this._damageState.set('crashed');
    }

    try {
      body.setNextKinematicTranslation(correction.position);
      body.setNextKinematicRotation(state.orientation);
    } catch {
      /* ignore */
    }

    this.prevPos = { ...correction.position };
    this._lastCorrection.set(correction);
    return correction;
  }

  /**
   * Reliable hybrid queries: sweep along motion + intersect at destination.
   */
  private queryHits(
    state: DroneCollisionSyncState,
    droneBody: RAPIER.RigidBody,
  ): RawCollisionHit[] {
    const R = this.world.getRapier();
    const rapierWorld = this.world.getWorld();
    if (!R || !rapierWorld) {
      return [];
    }

    if (!this.queryShape) {
      this.queryShape = new R.Ball(QUERY_RADIUS);
    }

    const hits: RawCollisionHit[] = [];
    const seen = new Set<string>();
    const groups = interactionGroups(CollisionGroup.DRONE, DRONE_COLLIDES_WITH);
    const shape = this.queryShape;
    const rot = state.orientation;

    const pushHit = (
      collider: RAPIER.Collider,
      normal: Vec3,
      point: Vec3,
      penetration: number,
    ): void => {
      const body = this.world.findBodyByColliderHandle(collider.handle);
      if (!body) {
        return;
      }
      const def = body.definition;
      if (def.sensor && def.material !== 'water') {
        return;
      }
      if (seen.has(def.id)) {
        return;
      }
      seen.add(def.id);

      const nLen = Math.hypot(normal.x, normal.y, normal.z) || 1;
      const n = {
        x: normal.x / nLen,
        y: normal.y / nLen,
        z: normal.z / nLen,
      };

      hits.push({
        objectId: def.id,
        material: def.material,
        point,
        normal: n,
        penetration: Math.max(0, penetration),
        relativeVelocity: { ...state.velocity },
        isSensor: !!def.sensor,
        isWater: def.material === 'water',
        isGroundLike:
          def.objectId === 'terrain' ||
          def.material === 'grass' ||
          def.material === 'dirt',
        propStrike: false,
        damageMultiplier: def.damageMultiplier ?? 1,
        timestampMs: state.timestampMs,
      });
    };

    const dx = state.position.x - this.prevPos.x;
    const dy = state.position.y - this.prevPos.y;
    const dz = state.position.z - this.prevPos.z;
    const travel = Math.hypot(dx, dy, dz);

    // 1) Shape cast along the motion path (catches hits while flying through).
    if (travel > 1e-5) {
      try {
        const castHit = rapierWorld.castShape(
          this.prevPos,
          rot,
          { x: dx, y: dy, z: dz },
          shape,
          0,
          1,
          true,
          undefined,
          groups,
          undefined,
          droneBody,
        );
        if (castHit?.collider) {
          const n2 = castHit.normal2;
          // normal2 is on the obstacle in local space of the obstacle... 
          // For world-ish response, prefer direction from obstacle toward drone.
          const other = castHit.collider.parent()?.translation() ?? {
            x: state.position.x - dx,
            y: state.position.y - dy,
            z: state.position.z - dz,
          };
          let nx = state.position.x - other.x;
          let ny = state.position.y - other.y;
          let nz = state.position.z - other.z;
          if (Math.hypot(nx, ny, nz) < 1e-4) {
            nx = n2.x;
            ny = n2.y;
            nz = n2.z;
          }
          const toi = castHit.time_of_impact;
          pushHit(
            castHit.collider,
            { x: nx, y: ny, z: nz },
            {
              x: this.prevPos.x + dx * toi,
              y: this.prevPos.y + dy * toi,
              z: this.prevPos.z + dz * toi,
            },
            Math.max(0.01, QUERY_RADIUS * (1 - toi)),
          );
        }
      } catch {
        /* query failure must not break flight */
      }
    }

    // 2) Intersection test at the destination (embedded / slow approaches).
    try {
      rapierWorld.intersectionsWithShape(
        state.position,
        rot,
        shape,
        (collider) => {
          const otherBody = collider.parent();
          if (!otherBody || otherBody.handle === droneBody.handle) {
            return true;
          }
          const t = otherBody.translation();
          let nx = state.position.x - t.x;
          let ny = state.position.y - t.y;
          let nz = state.position.z - t.z;
          let len = Math.hypot(nx, ny, nz);
          if (len < 1e-4) {
            nx = 0;
            ny = 1;
            nz = 0;
            len = 1;
          }
          // Approximate penetration from query radius (obstacle extent unknown).
          const penetration = Math.max(0.02, QUERY_RADIUS * 0.5);
          pushHit(
            collider,
            { x: nx / len, y: ny / len, z: nz / len },
            {
              x: state.position.x - (nx / len) * QUERY_RADIUS,
              y: state.position.y - (ny / len) * QUERY_RADIUS,
              z: state.position.z - (nz / len) * QUERY_RADIUS,
            },
            penetration,
          );
          return true;
        },
        undefined,
        groups,
        undefined,
        droneBody,
      );
    } catch {
      /* ignore */
    }

    return hits;
  }
}
