/**
 * Rapier collision groups (bitmasks).
 * Membership = which group the collider belongs to.
 * Filter = which groups it can interact with.
 *
 * Rapier packs: membership in low 16 bits, filter in high 16 bits
 * via InteractionGroups helpers.
 */
export const CollisionGroup = {
  DRONE: 0x0001,
  TERRAIN: 0x0002,
  STATIC_STRUCTURE: 0x0004,
  DYNAMIC_PROP: 0x0008,
  GATE_SENSOR: 0x0010,
  TRAINING_SENSOR: 0x0020,
  GHOST: 0x0040,
  DECORATION: 0x0080,
  WATER: 0x0100,
  REPLAY_VISUAL: 0x0200,
} as const;

export type CollisionGroupId = (typeof CollisionGroup)[keyof typeof CollisionGroup];

/** Groups the drone physically collides with. */
export const DRONE_COLLIDES_WITH =
  CollisionGroup.TERRAIN |
  CollisionGroup.STATIC_STRUCTURE |
  CollisionGroup.DYNAMIC_PROP |
  CollisionGroup.WATER;

/** Dynamic props collide with terrain, structures, drone, and other props. */
export const DYNAMIC_PROP_COLLIDES_WITH =
  CollisionGroup.TERRAIN |
  CollisionGroup.STATIC_STRUCTURE |
  CollisionGroup.DRONE |
  CollisionGroup.DYNAMIC_PROP;

/** Static structures collide with drone and dynamic props. */
export const STATIC_COLLIDES_WITH =
  CollisionGroup.DRONE | CollisionGroup.DYNAMIC_PROP;

/** Terrain collides with drone and dynamic props. */
export const TERRAIN_COLLIDES_WITH =
  CollisionGroup.DRONE | CollisionGroup.DYNAMIC_PROP;

/** Sensors do not produce physical response (filter excludes DRONE physical). */
export const SENSOR_COLLIDES_WITH = CollisionGroup.DRONE;

/**
 * Pack membership + filter into Rapier's InteractionGroups u32.
 * Low 16 = membership, high 16 = filter.
 */
export function interactionGroups(
  membership: number,
  filter: number,
): number {
  return (membership & 0xffff) | ((filter & 0xffff) << 16);
}
