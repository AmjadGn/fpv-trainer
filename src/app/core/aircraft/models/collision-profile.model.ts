import type { Vec3 } from '../../flight/models/flight-state.model';

export type ColliderPartKind =
  | 'body'
  | 'battery'
  | 'arm'
  | 'motor'
  | 'propRing'
  | 'camera'
  | 'cameraCage'
  | 'antenna';

export interface ColliderPartDef {
  kind: ColliderPartKind;
  shape: 'box' | 'sphere' | 'cylinder';
  /** Half-extents for box; radius (+ optional halfHeight for cylinder) for others. */
  halfExtents?: Vec3;
  radius?: number;
  halfHeight?: number;
  translation: Vec3;
  /** Yaw radians for arm alignment. */
  yaw?: number;
  tag: string;
}

export interface CollisionProfile {
  id: string;
  version: string;
  /** Approximate query ball radius for shape-cast sweeps. */
  queryRadius: number;
  collisionScale: number;
  parts: ColliderPartDef[];
  damageMultiplier: number;
}
