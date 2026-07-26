import { TestBed } from '@angular/core/testing';

import { AircraftCatalogService } from '../../aircraft/services/aircraft-catalog.service';
import { SelectedAircraftService } from '../../aircraft/services/selected-aircraft.service';
import { FlightSimulationClock } from '../../flight-runtime/services/flight-simulation-clock.service';
import { AuthoritativeFlightStepPublisher } from '../../flight-runtime/services/authoritative-flight-step-publisher.service';
import { FlightCameraSnapshotAdapter } from '../../camera/services/flight-camera-snapshot-adapter.service';
import { FlightCameraRigResolver } from '../../camera/services/flight-camera-rig-resolver.service';
import { MissionAircraftCapabilitiesAdapter } from '../adapters/mission-aircraft-capabilities.adapter';
import { UnavailableMissionSpatialQueryAdapter } from '../adapters/unavailable-mission-spatial-query.adapter';
import {
  NullLocationAssetLoadPort,
  NullLocationDefinitionSource,
  NullLocationRuntimeInstallPort,
} from '../adapters/null-location.adapters';
import { createMissionFlightLaunchIntent } from '../models/mission-launch-intent';
import { MissionSessionFacade } from '../services/mission-session.facade';
import { MissionLaunchCoordinator } from '../services/mission-launch-coordinator.service';
import { LocationLoadCoordinator } from '../services/location-load-coordinator.service';
import { MissionRuntimeCoordinator } from '../services/mission-runtime-coordinator.service';
import { DEFAULT_AIRCRAFT_ID } from '../../aircraft/models/aircraft-ids';

describe('Mission coordinators foundations', () => {
  let facade: MissionSessionFacade;
  let launch: MissionLaunchCoordinator;
  let runtime: MissionRuntimeCoordinator;
  let publisher: AuthoritativeFlightStepPublisher;
  let clock: FlightSimulationClock;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MissionSessionFacade,
        MissionLaunchCoordinator,
        LocationLoadCoordinator,
        MissionRuntimeCoordinator,
        MissionAircraftCapabilitiesAdapter,
        FlightSimulationClock,
        AuthoritativeFlightStepPublisher,
        FlightCameraSnapshotAdapter,
        FlightCameraRigResolver,
        UnavailableMissionSpatialQueryAdapter,
        NullLocationDefinitionSource,
        NullLocationAssetLoadPort,
        NullLocationRuntimeInstallPort,
        AircraftCatalogService,
        SelectedAircraftService,
      ],
    });
    facade = TestBed.inject(MissionSessionFacade);
    launch = TestBed.inject(MissionLaunchCoordinator);
    runtime = TestBed.inject(MissionRuntimeCoordinator);
    publisher = TestBed.inject(AuthoritativeFlightStepPublisher);
    clock = TestBed.inject(FlightSimulationClock);
    publisher.clearObservers();
    facade.reset();
    runtime.detach();
  });

  it('rejects invalid launch intent', async () => {
    const result = await launch.prepareLaunch({ kind: 'mission' });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostic.code).toBe('MISSION_LAUNCH_INTENT_INVALID');
    expect(facade.snapshot().phase).toBe('infrastructure-failed');
  });

  it('fails when location definition is unavailable (null adapter)', async () => {
    const intent = createMissionFlightLaunchIntent({
      missionId: 'm1',
      locationId: 'mediterranean-expedition-region',
      aircraftId: DEFAULT_AIRCRAFT_ID,
      aircraftSourceType: 'factory',
    });
    expect(intent.ok).toBe(true);
    if (!intent.ok) {
      return;
    }
    const result = await launch.prepareLaunch(intent.intent);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostic.code).toBe('LOCATION_DEFINITION_UNAVAILABLE');
  });

  it('supports development skipLocationLoad preparation path', async () => {
    const intent = createMissionFlightLaunchIntent({
      missionId: 'm1',
      locationId: 'mediterranean-expedition-region',
      aircraftId: DEFAULT_AIRCRAFT_ID,
      aircraftSourceType: 'factory',
      developmentFlags: { skipLocationLoad: true },
    });
    expect(intent.ok).toBe(true);
    if (!intent.ok) {
      return;
    }
    const result = await launch.prepareLaunch(intent.intent);
    expect(result.ok).toBe(true);
    expect(facade.snapshot().phase).toBe('ready');
    expect(facade.snapshot().aircraftCapabilities?.aircraftId).toBe(DEFAULT_AIRCRAFT_ID);
  });

  it('reports spatial-query unavailable diagnostic', () => {
    const diagnostic = runtime.probeSpatialQuery();
    expect(diagnostic?.code).toBe('SPATIAL_QUERY_UNAVAILABLE');
  });

  it('retry does not duplicate observers', () => {
    const gen1 = clock.beginSession();
    runtime.attach(gen1);
    expect(publisher.observerIds()).toEqual(['mission-runtime-coordinator']);
    const gen2 = clock.resetSession();
    runtime.prepareRetry(gen2);
    expect(publisher.observerIds()).toEqual(['mission-runtime-coordinator']);
  });

  it('exit teardown removes observers and resets facade', async () => {
    const gen = clock.beginSession();
    runtime.attach(gen);
    await runtime.exitAndTeardown();
    expect(runtime.isSubscribed()).toBe(false);
    expect(publisher.observerIds()).toEqual([]);
    expect(facade.snapshot().phase).toBe('idle');
  });

  it('rejects stale session callbacks', () => {
    const gen = clock.beginSession();
    runtime.attach(gen);
    runtime.onAuthoritativeFixedStep({
      simulationTick: 1,
      fixedStepSeconds: 1 / 120,
      sessionGeneration: gen + 99,
      pose: {
        position: { x: 0, y: 1, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
      linearVelocity: { x: 0, y: 0, z: 0 },
      bodyAngularVelocity: { pitch: 0, yaw: 0, roll: 0 },
      armed: true,
      crashed: false,
      altitudeMeters: 1,
      speedMps: 0,
      aircraftId: DEFAULT_AIRCRAFT_ID,
      aircraftSourceType: 'factory',
      definitionVersion: null,
      physicsProfileVersion: null,
      collisionOutcome: 'none',
      runtimeCompatibilityVersion: '1',
    });
    expect(facade.snapshot().phase).toBe('infrastructure-failed');
    expect(
      facade.snapshot().diagnostics.some((d) => d.code === 'STALE_RUNTIME_SESSION'),
    ).toBe(true);
  });

  it('session reset leaves free-flight path unaffected conceptually', () => {
    facade.beginPreparation(
      {
        kind: 'mission',
        missionId: 'm',
        locationId: 'l',
        aircraftId: DEFAULT_AIRCRAFT_ID,
        aircraftSourceType: 'factory',
      },
      1,
    );
    facade.reset();
    expect(facade.snapshot().phase).toBe('idle');
    expect(facade.snapshot().missionId).toBeNull();
  });
});
