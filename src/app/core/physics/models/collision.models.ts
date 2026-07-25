import type { Quat, Vec3 } from '../../flight/models/flight-state.model';
import type { CollisionGroupId } from './collision-groups';

export type ColliderShapeKind =
  | 'box'
  | 'sphere'
  | 'capsule'
  | 'cylinder'
  | 'convexHull'
  | 'trimesh'
  | 'heightfield';

export type PhysicsBodyType = 'fixed' | 'dynamic' | 'kinematic';

export type CollisionMaterialId =
  | 'grass'
  | 'dirt'
  | 'rock'
  | 'concrete'
  | 'metal'
  | 'wood'
  | 'plastic'
  | 'water'
  | 'droneCarbon'
  | 'cardboard';

export type CollisionOutcome =
  | 'none'
  | 'scrape'
  | 'moderate'
  | 'severe'
  | 'catastrophic'
  | 'safeLanding'
  | 'hardLanding'
  | 'waterCrash'
  | 'propStrike';

export type CrashReason =
  | 'terrain'
  | 'structure'
  | 'propStrike'
  | 'water'
  | 'outOfBounds'
  | 'hardLanding'
  | 'unknown';

export type DroneDamageState =
  | 'pristine'
  | 'scratched'
  | 'damaged'
  | 'critical'
  | 'crashed';

export interface ColliderShapeDef {
  kind: ColliderShapeKind;
  /** Half extents for box (x,y,z). */
  halfExtents?: Vec3;
  radius?: number;
  /** Capsule/cylinder half-height along Y. */
  halfHeight?: number;
  /** Local offset from body origin. */
  translation?: Vec3;
  /** Local rotation. */
  rotation?: Quat;
  /** Heightfield: row-major heights matching rendered terrain. */
  heightfield?: {
    nrows: number;
    ncols: number;
    heights: Float32Array | number[];
    scale: Vec3;
  };
  /** Convex / trimesh vertices (flat xyz). */
  vertices?: Float32Array | number[];
  /** Trimesh indices. */
  indices?: Uint32Array | number[];
}

export interface EnvironmentColliderDefinition {
  id: string;
  objectId: string;
  bodyType: PhysicsBodyType;
  shape: ColliderShapeDef;
  /** Additional compound shapes on the same body. */
  additionalShapes?: ColliderShapeDef[];
  position: Vec3;
  rotation: Quat;
  scale?: Vec3;
  material: CollisionMaterialId;
  collisionGroup: CollisionGroupId;
  collidesWith: number;
  sensor?: boolean;
  enabledByQuality?: 'low' | 'medium' | 'high' | 'all';
  damageMultiplier?: number;
  dynamicProperties?: DynamicPropProperties | null;
  /** Competitive courses always keep these regardless of quality. */
  collisionCritical?: boolean;
}

export interface DynamicPropProperties {
  mass: number;
  centerOfMass?: Vec3;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  breakThreshold?: number | null;
  impactSoundCategory: CollisionMaterialId;
  canSleep: boolean;
  propKind:
    | 'woodenCrate'
    | 'cardboardBox'
    | 'metalBarrel'
    | 'plasticBarrier'
    | 'trafficCone'
    | 'pallet'
    | 'sign'
    | 'cableReel'
    | 'debris';
}

export interface CollisionContactEvent {
  timestampMs: number;
  objectId: string;
  material: CollisionMaterialId;
  impactStrength: number;
  collisionPoint: Vec3;
  collisionNormal: Vec3;
  relativeVelocity: Vec3;
  outcome: CollisionOutcome;
  crashState: boolean;
  crashReason?: CrashReason;
  sensor?: boolean;
  propStrike?: boolean;
}

export interface CollisionImpactThresholds {
  scrapeThreshold: number;
  moderateImpactThreshold: number;
  crashImpactThreshold: number;
  catastrophicImpactThreshold: number;
  safeLandingVerticalSpeed: number;
  hardLandingVerticalSpeed: number;
  safeLandingTiltRad: number;
}

/**
 * Competitive thresholds — not exposed in public UI.
 * Tuned to preserve recognizable flight feel while blocking soft wall clipping.
 */
export const DEFAULT_IMPACT_THRESHOLDS: CollisionImpactThresholds = {
  scrapeThreshold: 1.2,
  moderateImpactThreshold: 3.5,
  crashImpactThreshold: 7.5,
  catastrophicImpactThreshold: 14,
  safeLandingVerticalSpeed: 2.8,
  hardLandingVerticalSpeed: 4.5,
  safeLandingTiltRad: (40 * Math.PI) / 180,
};

export interface PhysicsTelemetry {
  stepMs: number;
  activeBodies: number;
  sleepingBodies: number;
  colliderCount: number;
  contactsThisStep: number;
  dynamicProps: number;
  debrisCount: number;
  particleCount: number;
  enabled: boolean;
  fallbackLegacyGround: boolean;
}

export interface CollisionCorrection {
  position: Vec3;
  velocity: Vec3;
  angularVelocity: { pitch: number; yaw: number; roll: number };
  orientation?: Quat;
  outcome: CollisionOutcome;
  crash: boolean;
  crashReason?: CrashReason;
  events: CollisionContactEvent[];
  damageDelta: number;
}
