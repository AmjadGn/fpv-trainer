import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CollisionGroup, STATIC_COLLIDES_WITH } from '../models/collision-groups';
import type { EnvironmentColliderDefinition } from '../models/collision.models';
import { __resetRapierAdapterForTests } from '../adapters/rapier.adapter';
import { PhysicsWorldService } from './physics-world.service';

function boxDef(
  id: string,
  position: { x: number; y: number; z: number },
): EnvironmentColliderDefinition {
  return {
    id,
    objectId: id,
    bodyType: 'fixed',
    shape: { kind: 'box', halfExtents: { x: 1, y: 1, z: 1 } },
    position: { ...position },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    material: 'concrete',
    collisionGroup: CollisionGroup.STATIC_STRUCTURE,
    collidesWith: STATIC_COLLIDES_WITH,
    sensor: false,
  };
}

describe('PhysicsWorldService collision suspension', () => {
  let world: PhysicsWorldService;

  beforeEach(async () => {
    __resetRapierAdapterForTests();
    world = new PhysicsWorldService();
    const ok = await world.initialize();
    expect(ok).toBe(true);
  });

  afterEach(() => {
    world.dispose();
    __resetRapierAdapterForTests();
  });

  it('suspends registered bodies while preserving drone and exact definitions', async () => {
    const a = world.registerBody(boxDef('trainer:wall-a', { x: 1, y: 2, z: 3 }));
    const b = world.registerBody(boxDef('trainer:wall-b', { x: -4, y: 1, z: 0 }));
    expect(a && b).toBeTruthy();

    const R = world.getRapier()!;
    const rapierWorld = world.getWorld()!;
    const drone = rapierWorld.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    const droneCol = rapierWorld.createCollider(R.ColliderDesc.ball(0.2), drone);
    world.setDroneBody(drone, [droneCol]);

    const beforeIds = world.getAllBodies().map((body) => body.id).sort();
    expect(beforeIds).toEqual(['trainer:wall-a', 'trainer:wall-b']);

    const suspended = world.suspendRegisteredBodiesKeepingDrone();
    expect(suspended.ok).toBe(true);
    if (!suspended.ok) {
      return;
    }
    expect(world.getAllBodies()).toHaveLength(0);
    expect(world.getDroneBody()).toBe(drone);
    expect(world.suspendedEnvironmentBodyIds()).toEqual(beforeIds);

    const restored = world.restoreSuspendedBodies(suspended.handle);
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.restoredCount).toBe(2);
    const after = world.getAllBodies().slice().sort((x, y) => x.id.localeCompare(y.id));
    expect(after.map((body) => body.id)).toEqual(beforeIds);
    expect(after[0]!.definition.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(after[0]!.definition.material).toBe('concrete');
    expect(after[0]!.definition.bodyType).toBe('fixed');
    expect(after[0]!.definition.sensor).toBe(false);
    expect(after[0]!.definition.collisionGroup).toBe(CollisionGroup.STATIC_STRUCTURE);
    expect(world.getDroneBody()).toBe(drone);
  });

  it('rejects double suspension and double restoration', () => {
    world.registerBody(boxDef('trainer:one', { x: 0, y: 1, z: 0 }));
    const first = world.suspendRegisteredBodiesKeepingDrone();
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(world.suspendRegisteredBodiesKeepingDrone().ok).toBe(false);

    const once = world.restoreSuspendedBodies(first.handle);
    expect(once.ok).toBe(true);
    const twice = world.restoreSuspendedBodies(first.handle);
    expect(twice.ok).toBe(false);
    if (!twice.ok) {
      expect(twice.reason).toBe('unknown-handle');
    }
  });

  it('restore is deterministic and does not duplicate bodies across cycles', () => {
    world.registerBody(boxDef('trainer:cycle-a', { x: 2, y: 0, z: 2 }));
    world.registerBody(boxDef('trainer:cycle-b', { x: 3, y: 0, z: 3 }));

    for (let i = 0; i < 3; i++) {
      const suspended = world.suspendRegisteredBodiesKeepingDrone();
      expect(suspended.ok).toBe(true);
      if (!suspended.ok) {
        return;
      }
      expect(world.getAllBodies()).toHaveLength(0);
      const restored = world.restoreSuspendedBodies(suspended.handle);
      expect(restored.ok).toBe(true);
      expect(world.getAllBodies()).toHaveLength(2);
      expect(world.getAllBodies().map((b) => b.id).sort()).toEqual([
        'trainer:cycle-a',
        'trainer:cycle-b',
      ]);
    }
  });

  it('discard drops snapshot without restoring bodies', () => {
    world.registerBody(boxDef('trainer:discard', { x: 0, y: 1, z: 0 }));
    const suspended = world.suspendRegisteredBodiesKeepingDrone();
    expect(suspended.ok).toBe(true);
    if (!suspended.ok) {
      return;
    }
    expect(world.discardSuspendedBodies(suspended.handle)).toBe(true);
    expect(world.getAllBodies()).toHaveLength(0);
    const restore = world.restoreSuspendedBodies(suspended.handle);
    expect(restore.ok).toBe(false);
  });
});
