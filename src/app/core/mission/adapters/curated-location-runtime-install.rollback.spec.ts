import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COASTAL_RUINS_LAYOUT,
  SUBJECT_IDS,
  MEDITERRANEAN_LOCATION_ID,
} from '../../../content/locations/mediterranean-expedition-region';
import { CollisionGroup, STATIC_COLLIDES_WITH } from '../../physics/models/collision-groups';
import type { EnvironmentColliderDefinition } from '../../physics/models/collision.models';
import { __resetRapierAdapterForTests } from '../../physics/adapters/rapier.adapter';
import { PhysicsWorldService } from '../../physics/services/physics-world.service';
import { ThreeRendererService } from '../../rendering/services/three-renderer.service';
import { LocationRuntimeDiagnosticsService } from '../services/location-runtime-diagnostics.service';
import { CuratedLocationRuntimeInstallAdapter } from './curated-location-runtime-install.adapter';
import { RapierCuratedLocationCollisionAdapter } from './rapier-curated-location-collision.adapter';
import {
  MISSION_LOS_ENDPOINT_EPSILON_METERS,
  RapierMissionSpatialQueryAdapter,
} from './rapier-mission-spatial-query.adapter';

function trainerBox(id: string): EnvironmentColliderDefinition {
  return {
    id,
    objectId: id,
    bodyType: 'fixed',
    shape: { kind: 'box', halfExtents: { x: 1, y: 1, z: 1 } },
    position: { x: 10, y: 1, z: 10 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    material: 'wood',
    collisionGroup: CollisionGroup.STATIC_STRUCTURE,
    collidesWith: STATIC_COLLIDES_WITH,
  };
}

function createRendererMock() {
  return {
    installCuratedLocationGroup: vi.fn(),
    uninstallCuratedLocationGroup: vi.fn(),
    setTrainerEnvironmentVisible: vi.fn(),
  };
}

function createMissionPhysicsInjector(renderer = createRendererMock()) {
  return Injector.create({
    providers: [
      PhysicsWorldService,
      RapierCuratedLocationCollisionAdapter,
      RapierMissionSpatialQueryAdapter,
      LocationRuntimeDiagnosticsService,
      CuratedLocationRuntimeInstallAdapter,
      { provide: ThreeRendererService, useValue: renderer },
    ],
  });
}

describe('Curated location runtime install rollback', () => {
  let world: PhysicsWorldService;
  let install: CuratedLocationRuntimeInstallAdapter;
  let collision: RapierCuratedLocationCollisionAdapter;
  let spatial: RapierMissionSpatialQueryAdapter;
  let renderer: ReturnType<typeof createRendererMock>;
  let injector: Injector;

  beforeEach(async () => {
    __resetRapierAdapterForTests();
    renderer = createRendererMock();
    injector = createMissionPhysicsInjector(renderer);
    world = injector.get(PhysicsWorldService);
    install = injector.get(CuratedLocationRuntimeInstallAdapter);
    collision = injector.get(RapierCuratedLocationCollisionAdapter);
    spatial = injector.get(RapierMissionSpatialQueryAdapter);
    expect(await world.initialize()).toBe(true);
  });

  afterEach(async () => {
    try {
      await install.unload('cleanup');
    } catch {
      /* ignore */
    }
    world.dispose();
    __resetRapierAdapterForTests();
  });

  it('trainer bodies exist, are suspended on success, and restored on unload', async () => {
    world.registerBody(trainerBox('trainer:env-a'));
    world.registerBody(trainerBox('trainer:env-b'));
    const before = world.getAllBodies().map((b) => b.id).sort();
    expect(before).toEqual(['trainer:env-a', 'trainer:env-b']);

    const result = await install.install('h1', MEDITERRANEAN_LOCATION_ID);
    expect(result.ok).toBe(true);
    expect(install.hasRetainedPreviousCollisionHandle()).toBe(true);
    expect(world.getAllBodies().some((b) => b.id.startsWith('trainer:'))).toBe(false);
    expect(world.getAllBodies().some((b) => b.id.startsWith('curated:'))).toBe(true);
    expect(collision.isInstalled()).toBe(true);
    expect(spatial.isAvailable()).toBe(true);

    await install.unload('h1');
    expect(collision.isInstalled()).toBe(false);
    expect(spatial.isAvailable()).toBe(false);
    expect(world.getAllBodies().map((b) => b.id).sort()).toEqual(before);
    expect(world.getAllBodies().some((b) => b.id.startsWith('curated:'))).toBe(false);
    expect(renderer.setTrainerEnvironmentVisible).toHaveBeenCalledWith(true);
  });

  it('visual-build path failure before suspend leaves previous bodies intact', async () => {
    world.registerBody(trainerBox('trainer:keep'));
    const before = world.getAllBodies().map((b) => b.id);

    const privateInstall = install as unknown as {
      visualBuilder: { build: (quality: string) => unknown };
    };
    const originalBuild = privateInstall.visualBuilder.build;
    privateInstall.visualBuilder.build = () => {
      throw new Error('proxy visual boom');
    };

    try {
      const result = await install.install('h-fail-visual', MEDITERRANEAN_LOCATION_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.code).toBe('LOCATION_VISUAL_BUILD_FAILED');
      }
      expect(world.getAllBodies().map((b) => b.id)).toEqual(before);
    } finally {
      privateInstall.visualBuilder.build = originalBuild;
    }
  });

  it('collision-build failure restores previous bodies', async () => {
    world.registerBody(trainerBox('trainer:restore-on-collision-fail'));
    const before = world.getAllBodies().map((b) => b.id).sort();

    const originalInstall = collision.install.bind(collision);
    collision.install = () => null;

    try {
      const result = await install.install('h-fail-col', MEDITERRANEAN_LOCATION_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.code).toBe('LOCATION_COLLISION_BUILD_FAILED');
      }
      expect(world.getAllBodies().map((b) => b.id).sort()).toEqual(before);
    } finally {
      collision.install = originalInstall;
    }
  });

  it('query-install failure restores previous bodies', async () => {
    world.registerBody(trainerBox('trainer:restore-on-query-fail'));
    const before = world.getAllBodies().map((b) => b.id).sort();

    const originalInstall = spatial.install.bind(spatial);
    const originalAvailable = spatial.isAvailable.bind(spatial);
    spatial.install = () => {
      /* leave unavailable */
    };
    spatial.isAvailable = () => false;

    try {
      const result = await install.install('h-fail-query', MEDITERRANEAN_LOCATION_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.code).toBe('LOCATION_QUERY_INSTALL_FAILED');
      }
      expect(world.getAllBodies().map((b) => b.id).sort()).toEqual(before);
      expect(collision.isInstalled()).toBe(false);
    } finally {
      spatial.install = originalInstall;
      spatial.isAvailable = originalAvailable;
    }
  });

  it('cancellation after visual preparation retains previous bodies', async () => {
    world.registerBody(trainerBox('trainer:cancel-visual'));
    const before = world.getAllBodies().map((b) => b.id).sort();
    const controller = new AbortController();
    controller.abort();

    const early = await install.install('h-cancel-early', MEDITERRANEAN_LOCATION_ID, {
      signal: controller.signal,
    });
    expect(early.ok).toBe(false);
    expect(world.getAllBodies().map((b) => b.id).sort()).toEqual(before);
  });

  it('cancellation after collision installation restores previous bodies', async () => {
    world.registerBody(trainerBox('trainer:cancel-after-col'));
    const before = world.getAllBodies().map((b) => b.id).sort();
    const controller = new AbortController();

    const originalInstall = collision.install.bind(collision);
    collision.install = (locationId: string) => {
      const handle = originalInstall(locationId);
      controller.abort();
      return handle;
    };

    try {
      const result = await install.install('h-cancel-col', MEDITERRANEAN_LOCATION_ID, {
        signal: controller.signal,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.code).toBe('LOCATION_LOAD_CANCELLED');
      }
      expect(world.getAllBodies().map((b) => b.id).sort()).toEqual(before);
    } finally {
      collision.install = originalInstall;
    }
  });

  it('repeated load/unload does not duplicate previous or curated bodies', async () => {
    world.registerBody(trainerBox('trainer:cycle'));
    const R = world.getRapier()!;
    const rapierWorld = world.getWorld()!;
    const drone = rapierWorld.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    world.setDroneBody(drone, []);

    for (let i = 0; i < 3; i++) {
      const result = await install.install(`h-cycle-${i}`, MEDITERRANEAN_LOCATION_ID);
      expect(result.ok).toBe(true);
      const curatedIds = world.getAllBodies().filter((b) => b.id.startsWith('curated:'));
      const unique = new Set(curatedIds.map((b) => b.id));
      expect(unique.size).toBe(curatedIds.length);
      expect(world.getDroneBody()).toBe(drone);
      await install.unload(`h-cycle-${i}`);
      expect(world.getAllBodies().map((b) => b.id)).toEqual(['trainer:cycle']);
      expect(world.getDroneBody()).toBe(drone);
    }
  });

  it('free-flight trainer collisions remain available after expedition exit', async () => {
    world.registerBody(trainerBox('trainer:free-flight'));
    const result = await install.install('h-ff', MEDITERRANEAN_LOCATION_ID);
    expect(result.ok).toBe(true);
    await install.unload('h-ff');
    expect(world.hasBody('trainer:free-flight')).toBe(true);
    expect(world.getBody('trainer:free-flight')?.definition.material).toBe('wood');
  });

  it('runs install adapter construction inside an injection context', () => {
    expect(
      runInInjectionContext(injector, () => injector.get(CuratedLocationRuntimeInstallAdapter)),
    ).toBe(install);
  });
});

describe('Rapier live world LOS filtering', () => {
  let world: PhysicsWorldService;
  let collision: RapierCuratedLocationCollisionAdapter;
  let spatial: RapierMissionSpatialQueryAdapter;

  beforeEach(async () => {
    __resetRapierAdapterForTests();
    const injector = createMissionPhysicsInjector();
    world = injector.get(PhysicsWorldService);
    collision = injector.get(RapierCuratedLocationCollisionAdapter);
    spatial = injector.get(RapierMissionSpatialQueryAdapter);
    expect(await world.initialize()).toBe(true);
    const handle = collision.install(MEDITERRANEAN_LOCATION_ID);
    expect(handle).not.toBeNull();
    spatial.install({ locationGeneration: 7 });
    expect(spatial.isAvailable()).toBe(true);
  });

  afterEach(() => {
    spatial.uninstall();
    collision.unload();
    world.dispose();
    __resetRapierAdapterForTests();
  });

  const L = COASTAL_RUINS_LAYOUT;
  const arch = L.stoneArch;
  const tower = L.lookoutTower;
  const cliff = L.cliffsideRuin;

  it('documents a small endpoint epsilon rather than a large distance tolerance', () => {
    expect(MISSION_LOS_ENDPOINT_EPSILON_METERS).toBeLessThanOrEqual(1e-3);
    expect(MISSION_LOS_ENDPOINT_EPSILON_METERS).toBeGreaterThan(0);
  });

  it('clear segment with no obstacle', () => {
    const los = spatial.queryLineOfSight({
      startWorld: { x: 0, y: 40, z: 40 },
      endWorld: { x: 0, y: 40, z: 30 },
    });
    expect(los).toEqual({
      status: 'ok',
      unobstructed: true,
      firstHitDistanceMeters: null,
      obstructionCategory: null,
    });
  });

  it('terrain blocks LOS', () => {
    const los = spatial.queryLineOfSight({
      startWorld: { x: 0, y: 5, z: 0 },
      endWorld: { x: 0, y: -2, z: 0 },
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(false);
    expect(los.obstructionCategory).toBe('terrain');
  });

  it('static wall blocks LOS', () => {
    const wall = L.walls[0]!;
    const los = spatial.queryLineOfSight({
      startWorld: {
        x: wall.position.x,
        y: wall.position.y,
        z: wall.position.z + 8,
      },
      endWorld: {
        x: wall.position.x,
        y: wall.position.y,
        z: wall.position.z - 8,
      },
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(false);
    expect(los.obstructionCategory).toBe('static-environment');
  });

  it('ray through authored arch opening remains clear', () => {
    const los = spatial.queryLineOfSight({
      startWorld: { x: arch.position.x, y: arch.openingCenterY, z: arch.position.z + 12 },
      endWorld: { x: arch.position.x, y: arch.openingCenterY, z: arch.position.z - 12 },
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(true);
  });

  it('ray through an arch pillar is obstructed', () => {
    const pillarHalfX = (arch.outerHalfExtents.x - arch.openingHalfExtents.x) / 2;
    const pillarX = arch.position.x - (arch.openingHalfExtents.x + pillarHalfX);
    const los = spatial.queryLineOfSight({
      startWorld: { x: pillarX, y: arch.outerHalfExtents.y, z: arch.position.z + 10 },
      endWorld: { x: pillarX, y: arch.outerHalfExtents.y, z: arch.position.z - 10 },
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(false);
    expect(los.obstructionCategory).toBe('subject-geometry');
  });

  it('target arch collider is ignored when target is the arch', () => {
    const pillarHalfX = (arch.outerHalfExtents.x - arch.openingHalfExtents.x) / 2;
    const pillarX = arch.position.x - (arch.openingHalfExtents.x + pillarHalfX);
    const los = spatial.queryLineOfSight({
      startWorld: { x: pillarX, y: arch.outerHalfExtents.y, z: arch.position.z + 10 },
      endWorld: { x: pillarX, y: arch.outerHalfExtents.y, z: arch.position.z },
      targetSubjectId: SUBJECT_IDS.stoneSeaArch,
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(true);
  });

  it('tower geometry obstructs a query targeting the arch', () => {
    const los = spatial.queryLineOfSight({
      startWorld: {
        x: tower.position.x,
        y: tower.shaftCenterY,
        z: tower.position.z + 4,
      },
      endWorld: {
        x: tower.position.x,
        y: tower.shaftCenterY,
        z: tower.position.z - 4,
      },
      targetSubjectId: SUBJECT_IDS.stoneSeaArch,
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(false);
    expect(los.obstructionCategory).toBe('subject-geometry');
  });

  it('arch geometry obstructs a query targeting the tower', () => {
    const pillarHalfX = (arch.outerHalfExtents.x - arch.openingHalfExtents.x) / 2;
    const pillarX = arch.position.x - (arch.openingHalfExtents.x + pillarHalfX);
    const los = spatial.queryLineOfSight({
      startWorld: { x: pillarX, y: arch.outerHalfExtents.y, z: arch.position.z + 4 },
      endWorld: { x: pillarX, y: arch.outerHalfExtents.y, z: arch.position.z - 4 },
      targetSubjectId: SUBJECT_IDS.ruinedLookout,
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(false);
    expect(los.obstructionCategory).toBe('subject-geometry');
  });

  it('cliffside subject geometry obstructs a non-matching target query', () => {
    // Approach from above: cliffside wall extends higher than the main cliff AABB.
    const los = spatial.queryLineOfSight({
      startWorld: {
        x: cliff.position.x,
        y: cliff.position.y + cliff.wallHalfExtents.y * 2 + 2,
        z: cliff.position.z,
      },
      endWorld: {
        x: cliff.position.x,
        y: cliff.position.y + cliff.wallHalfExtents.y,
        z: cliff.position.z,
      },
      targetSubjectId: SUBJECT_IDS.stoneSeaArch,
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(false);
    expect(los.obstructionCategory).toBe('subject-geometry');
  });

  it('drone collider is ignored', () => {
    const R = world.getRapier()!;
    const rapierWorld = world.getWorld()!;
    const drone = rapierWorld.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 40, 35),
    );
    const col = rapierWorld.createCollider(R.ColliderDesc.ball(2), drone);
    world.setDroneBody(drone, [col]);

    const los = spatial.queryLineOfSight({
      startWorld: { x: 0, y: 40, z: 40 },
      endWorld: { x: 0, y: 40, z: 30 },
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(true);
  });

  it('sensor collider is ignored', () => {
    world.registerBody({
      id: 'test:sensor',
      objectId: 'test-sensor',
      bodyType: 'fixed',
      shape: { kind: 'box', halfExtents: { x: 2, y: 2, z: 2 } },
      position: { x: 0, y: 40, z: 35 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      material: 'plastic',
      collisionGroup: CollisionGroup.GATE_SENSOR,
      collidesWith: CollisionGroup.DRONE,
      sensor: true,
    });
    const los = spatial.queryLineOfSight({
      startWorld: { x: 0, y: 40, z: 40 },
      endWorld: { x: 0, y: 40, z: 30 },
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(true);
  });

  it('decorative non-authoritative collider is ignored', () => {
    world.registerBody({
      id: 'test:decor-rock',
      objectId: 'decor',
      bodyType: 'fixed',
      shape: { kind: 'box', halfExtents: { x: 2, y: 2, z: 2 } },
      position: { x: 0, y: 40, z: 35 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      material: 'rock',
      collisionGroup: CollisionGroup.DECORATION,
      collidesWith: CollisionGroup.DRONE,
    });
    const los = spatial.queryLineOfSight({
      startWorld: { x: 0, y: 40, z: 40 },
      endWorld: { x: 0, y: 40, z: 30 },
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(true);
  });

  it('stale location generation returns no clear result', () => {
    const los = spatial.queryLineOfSight({
      startWorld: { x: 0, y: 40, z: 40 },
      endWorld: { x: 0, y: 40, z: 30 },
      expectedLocationGeneration: 999,
    });
    expect(los.status).toBe('stale-session');
    expect(los.unobstructed).toBeNull();
  });

  it('unavailable runtime returns no clear result', () => {
    spatial.uninstall();
    const los = spatial.queryLineOfSight({
      startWorld: { x: 0, y: 40, z: 40 },
      endWorld: { x: 0, y: 40, z: 30 },
    });
    expect(los.status).toBe('unavailable');
    expect(los.unobstructed).toBeNull();
  });

  it('repeated identical queries return byte-identical plain DTO results', () => {
    const query = {
      startWorld: { x: arch.position.x, y: arch.openingCenterY, z: arch.position.z + 12 },
      endWorld: { x: arch.position.x, y: arch.openingCenterY, z: arch.position.z - 12 },
      targetSubjectId: SUBJECT_IDS.stoneSeaArch,
    };
    const a = spatial.queryLineOfSight(query);
    const b = spatial.queryLineOfSight(query);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('visibility sample ordering and visible fraction are deterministic', () => {
    const samples = [
      { x: arch.position.x, y: arch.openingCenterY, z: arch.position.z },
      { x: arch.position.x - 1.5, y: arch.openingCenterY + 1, z: arch.position.z },
      { x: arch.position.x + 1.5, y: arch.openingCenterY + 1, z: arch.position.z },
    ];
    const query = {
      originWorld: { x: arch.position.x, y: arch.openingCenterY, z: arch.position.z + 20 },
      samplePointsWorld: samples,
      targetSubjectId: SUBJECT_IDS.stoneSeaArch,
    };
    const a = spatial.queryVisibilitySamples(query);
    const b = spatial.queryVisibilitySamples(query);
    expect(a.status).toBe('ok');
    expect(a.visibleFraction).not.toBeNull();
    expect(a.sampleCount).toBe(3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('no-target LOS is conservative and includes subject geometry', () => {
    const pillarHalfX = (arch.outerHalfExtents.x - arch.openingHalfExtents.x) / 2;
    const pillarX = arch.position.x - (arch.openingHalfExtents.x + pillarHalfX);
    const los = spatial.queryLineOfSight({
      startWorld: { x: pillarX, y: arch.outerHalfExtents.y, z: arch.position.z + 10 },
      endWorld: { x: pillarX, y: arch.outerHalfExtents.y, z: arch.position.z - 10 },
    });
    expect(los.status).toBe('ok');
    expect(los.unobstructed).toBe(false);
    expect(los.obstructionCategory).toBe('subject-geometry');
  });
});
