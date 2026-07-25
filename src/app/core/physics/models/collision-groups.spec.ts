import { describe, expect, it } from 'vitest';

import {
  CollisionGroup,
  DRONE_COLLIDES_WITH,
  interactionGroups,
} from './collision-groups';

describe('collision groups', () => {
  it('packs membership and filter into InteractionGroups u32', () => {
    const packed = interactionGroups(CollisionGroup.DRONE, DRONE_COLLIDES_WITH);
    const membership = packed & 0xffff;
    const filter = (packed >>> 16) & 0xffff;

    expect(membership).toBe(CollisionGroup.DRONE);
    expect(filter).toBe(DRONE_COLLIDES_WITH);
    expect(packed).toBe(
      CollisionGroup.DRONE | (DRONE_COLLIDES_WITH << 16),
    );
  });

  it('drone filter includes terrain, static, dynamic — not ghost', () => {
    expect(DRONE_COLLIDES_WITH & CollisionGroup.TERRAIN).toBeTruthy();
    expect(DRONE_COLLIDES_WITH & CollisionGroup.STATIC_STRUCTURE).toBeTruthy();
    expect(DRONE_COLLIDES_WITH & CollisionGroup.DYNAMIC_PROP).toBeTruthy();
    expect(DRONE_COLLIDES_WITH & CollisionGroup.WATER).toBeTruthy();
    expect(DRONE_COLLIDES_WITH & CollisionGroup.GHOST).toBe(0);
  });
});
