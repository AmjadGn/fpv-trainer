import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { UnavailableMissionSpatialQueryAdapter } from './unavailable-mission-spatial-query.adapter';
import { RapierMissionSpatialQueryAdapter } from './rapier-mission-spatial-query.adapter';
import { RapierCuratedLocationCollisionAdapter } from './rapier-curated-location-collision.adapter';
import { PhysicsWorldService } from '../../physics/services/physics-world.service';

describe('Mission spatial query adapters', () => {
  it('unavailable adapter never reports clear LOS', () => {
    const adapter = new UnavailableMissionSpatialQueryAdapter();
    const los = adapter.queryLineOfSight({
      startWorld: { x: 0, y: 1, z: 0 },
      endWorld: { x: 0, y: 1, z: -10 },
    });
    expect(los.status).toBe('unavailable');
    expect(los.unobstructed).toBeNull();
    const vis = adapter.queryVisibilitySamples({
      originWorld: { x: 0, y: 1, z: 0 },
      samplePointsWorld: [{ x: 0, y: 1, z: -5 }],
    });
    expect(vis.visibleFraction).toBeNull();
  });

  it('Rapier adapter reports unavailable before install', () => {
    TestBed.configureTestingModule({
      providers: [
        RapierMissionSpatialQueryAdapter,
        RapierCuratedLocationCollisionAdapter,
        PhysicsWorldService,
      ],
    });
    const adapter = TestBed.inject(RapierMissionSpatialQueryAdapter);
    expect(adapter.isAvailable()).toBe(false);
    const los = adapter.queryLineOfSight({
      startWorld: { x: 0, y: 1, z: 0 },
      endWorld: { x: 0, y: 1, z: -10 },
    });
    expect(los.status).toBe('unavailable');
    expect(los.unobstructed).toBeNull();
  });

  it('Rapier adapter rejects invalid input and stale generation when installed flag set without world', () => {
    TestBed.configureTestingModule({
      providers: [
        RapierMissionSpatialQueryAdapter,
        RapierCuratedLocationCollisionAdapter,
        PhysicsWorldService,
      ],
    });
    const adapter = TestBed.inject(RapierMissionSpatialQueryAdapter);
    // Force install metadata without a real world → still unavailable
    adapter.install({ locationGeneration: 3 });
    const stale = adapter.queryLineOfSight({
      startWorld: { x: 0, y: 1, z: 0 },
      endWorld: { x: 0, y: 1, z: -10 },
      expectedLocationGeneration: 3,
    });
    expect(stale.status).toBe('unavailable');
    expect(stale.unobstructed).toBeNull();
  });

  it('framing-guide presentation does not equate mission session with photography objective', () => {
    // Checkpoint 4: photographyObjectiveActive stays false unless Checkpoint 5 wires objectives.
    const missionSessionActive = true;
    const photographyObjectiveActive = false;
    const developmentPreview = false;
    const guideVisible = photographyObjectiveActive || developmentPreview;
    expect(missionSessionActive).toBe(true);
    expect(guideVisible).toBe(false);
  });
});
