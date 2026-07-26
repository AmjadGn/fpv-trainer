import { TestBed } from '@angular/core/testing';

import { quatFromAxisAngle } from '../../flight/utils/quat-math';
import { FLIGHT_CONFIG } from '../../flight/config/flight-config';
import {
  computeLegacyFpvCameraPosition,
  resolveAuthoritativeFlightCameraWorldSnapshot,
} from '../math/flight-camera-world-pose';
import {
  LEGACY_FPV_BASE_FOV_DEGREES,
  LEGACY_FPV_MOUNT_POSITION,
} from '../models/resolved-flight-camera-rig';
import { FlightCameraRigResolver } from './flight-camera-rig-resolver.service';
import { FlightCameraSnapshotAdapter } from './flight-camera-snapshot-adapter.service';
import { threeFlightCameraViewAdapter } from '../adapters/three-flight-camera-view.adapter';
import { MISSION_CAPTURE_ASPECT_RATIO } from '@fpv/simulation-contracts';
import type { AircraftDefinition } from '../../aircraft/models/aircraft-definition.model';
import { fpvLookDirection } from '../../rendering/utils/flight-frame-sync';

function stubAircraft(overrides: Partial<AircraftDefinition> = {}): AircraftDefinition {
  return {
    id: 'stub-aircraft' as AircraftDefinition['id'],
    slug: 'stub',
    displayName: 'Stub',
    manufacturerName: 'Test',
    fictionalManufacturer: true,
    category: 'racing-5inch',
    generation: 1,
    releaseStatus: 'available',
    description: '',
    shortDescription: '',
    tags: [],
    referenceProfileId: null,
    referenceCategory: 'racing',
    derivedFromPublicSpecifications: false,
    physicsAccuracyLabel: '',
    legalNotes: '',
    widthMeters: 0.25,
    lengthMeters: 0.25,
    heightMeters: 0.08,
    wheelbaseMeters: 0.2,
    propellerDiameterMeters: 0.12,
    ductDiameterMeters: null,
    dryMassKg: 0.3,
    batteryMassKg: 0.15,
    takeoffMassKg: 0.45,
    centerOfMassOffset: { x: 0, y: 0, z: 0 },
    centerOfMassHeight: 0.02,
    nominalVoltage: 14.8,
    batteryCellCount: 4,
    batteryCapacityMah: 1300,
    maximumThrustNewtons: 20,
    hoverThrottleRatio: 0.5,
    thrustToWeightRatio: 4,
    motorResponseTime: 0.05,
    spoolUpTime: 0.1,
    spoolDownTime: 0.1,
    frontalDragCoefficient: 0.4,
    lateralDragCoefficient: 0.4,
    verticalDragCoefficient: 0.4,
    angularDrag: 0.2,
    propWashStrength: 0.1,
    groundEffectStrength: 0.1,
    windSensitivity: 0.2,
    glideEfficiency: 0.2,
    rollInertia: 0.01,
    pitchInertia: 0.01,
    yawInertia: 0.01,
    angularAccelerationLimits: { x: 10, y: 10, z: 10 },
    angularVelocityLimits: { x: 10, y: 10, z: 10 },
    defaultRateProfile: 'beginner',
    supportedRateProfiles: ['beginner'],
    throttleCurve: 0.5,
    throttleExpo: 0.2,
    stabilizationStrength: 0.5,
    selfLevelingAvailable: false,
    altitudeAssistAvailable: false,
    maximumForwardSpeed: 30,
    maximumClimbSpeed: 15,
    maximumDescentSpeed: 15,
    brakingStrength: 0.5,
    recoveryStrength: 0.5,
    flightProfile: {} as AircraftDefinition['flightProfile'],
    cameraProfile: {
      id: 'cam',
      version: '1',
      fpv: {
        localPosition: { x: 0, y: 0.5, z: -1 },
        cameraAngleDeg: 20,
        angleRangeDeg: { min: 0, max: 45 },
        defaultFov: 90,
        minFov: 60,
        maxFov: 120,
        vibrationResponse: 0,
        impactShakeMultiplier: 0,
        cameraNoise: 0,
        propellerVisibility: true,
        bodyVisibility: true,
      },
      chase: {} as AircraftDefinition['cameraProfile']['chase'],
      replay: {} as AircraftDefinition['cameraProfile']['replay'],
    },
    collisionProfile: {
      id: 'col',
      version: '1',
      queryRadius: 0.3,
      collisionScale: 1,
      parts: [
        {
          kind: 'body',
          shape: 'box',
          halfExtents: { x: 0.1, y: 0.05, z: 0.1 },
          translation: { x: 0, y: 0, z: 0 },
          tag: 'body',
        },
      ],
      damageMultiplier: 1,
    },
    visualProfile: {} as AircraftDefinition['visualProfile'],
    audioProfile: {} as AircraftDefinition['audioProfile'],
    damageProfile: {} as AircraftDefinition['damageProfile'],
    difficulty: 1,
    recommendedSkillLevel: 'beginner',
    recommendedModes: [],
    recommendedEnvironments: [],
    unlockPolicy: 'default',
    isAvailableByDefault: true,
    definitionVersion: '1.0.0',
    physicsProfileVersion: '1.0.0',
    colliderVersion: '1.0.0',
    visualVersion: '1.0.0',
    audioVersion: '1.0.0',
    ...overrides,
  };
}

describe('FlightCameraRigResolver', () => {
  let resolver: FlightCameraRigResolver;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FlightCameraRigResolver] });
    resolver = TestBed.inject(FlightCameraRigResolver);
  });

  it('resolves legacy-compatible mount, tilt, and base FOV by default', () => {
    const aircraft = stubAircraft();
    const rig = resolver.resolve({
      aircraft,
      appliedFpvCameraTiltRad: FLIGHT_CONFIG.fpvCameraTilt,
    });
    expect(rig.resolutionStrategy).toBe('legacy-renderer-compatible-v1');
    expect(rig.localMountPosition).toEqual(LEGACY_FPV_MOUNT_POSITION);
    expect(rig.localCameraTiltRad).toBeCloseTo(FLIGHT_CONFIG.fpvCameraTilt, 10);
    expect(rig.baseVerticalFovDegrees).toBe(LEGACY_FPV_BASE_FOV_DEGREES);
    expect(rig.legacyCompatibilityUsed).toBe(true);
    expect(rig.cosmeticEffectsExcluded).toBe(true);
    expect(rig.missionCaptureAspectRatio).toBe(MISSION_CAPTURE_ASPECT_RATIO);
    expect(rig.sourceCameraProfile.mismatchDiagnostics.length).toBeGreaterThan(0);
  });

  it('marks compiled aircraft as template-derived', () => {
    const aircraft = stubAircraft({ tags: ['user-build', 'compiled'] });
    const rig = resolver.resolve({
      aircraft,
      appliedFpvCameraTiltRad: FLIGHT_CONFIG.fpvCameraTilt,
    });
    expect(rig.templateDerivedCamera).toBe(true);
  });

  it('supports aircraft-profile-v1 when requested', () => {
    const aircraft = stubAircraft();
    const rig = resolver.resolve({
      aircraft,
      appliedFpvCameraTiltRad: 0,
      strategy: 'aircraft-profile-v1',
    });
    expect(rig.resolutionStrategy).toBe('aircraft-profile-v1');
    expect(rig.localMountPosition).toEqual(aircraft.cameraProfile.fpv.localPosition);
    expect(rig.baseVerticalFovDegrees).toBe(90);
    expect(rig.legacyCompatibilityUsed).toBe(false);
  });
});

describe('Authoritative camera world pose', () => {
  let resolver: FlightCameraRigResolver;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FlightCameraRigResolver, FlightCameraSnapshotAdapter],
    });
    resolver = TestBed.inject(FlightCameraRigResolver);
  });

  it('matches legacy camera position within tight tolerance', () => {
    const rig = resolver.resolve({
      aircraft: stubAircraft(),
      appliedFpvCameraTiltRad: FLIGHT_CONFIG.fpvCameraTilt,
    });
    const pos = { x: 1, y: 2, z: 3 };
    const q = { x: 0, y: 0, z: 0, w: 1 };
    const world = resolveAuthoritativeFlightCameraWorldSnapshot(pos, q, rig);
    const legacy = computeLegacyFpvCameraPosition(pos, q, LEGACY_FPV_MOUNT_POSITION);
    expect(world.worldPose.position.x).toBeCloseTo(legacy.x, 9);
    expect(world.worldPose.position.y).toBeCloseTo(legacy.y, 9);
    expect(world.worldPose.position.z).toBeCloseTo(legacy.z, 9);
    expect(world.worldPose.position.y).toBeCloseTo(2.12, 9);
  });

  it('matches legacy orientation for yaw 90 and 180', () => {
    const rig = resolver.resolve({
      aircraft: stubAircraft(),
      appliedFpvCameraTiltRad: 0,
    });
    for (const yaw of [-Math.PI / 2, Math.PI]) {
      const q = quatFromAxisAngle(0, 1, 0, yaw);
      const world = resolveAuthoritativeFlightCameraWorldSnapshot(
        { x: 0, y: 1, z: 0 },
        q,
        rig,
      );
      const expected = fpvLookDirection(q, 0);
      expect(world.forwardWorld.x).toBeCloseTo(expected.x, 9);
      expect(world.forwardWorld.y).toBeCloseTo(expected.y, 9);
      expect(world.forwardWorld.z).toBeCloseTo(expected.z, 9);
    }
  });

  it('authoritative snapshot ignores viewport, DPR, and shake', () => {
    const adapter = TestBed.inject(FlightCameraSnapshotAdapter);
    const rig = adapter.resolveAndActivate({
      aircraft: stubAircraft(),
      appliedFpvCameraTiltRad: FLIGHT_CONFIG.fpvCameraTilt,
    });
    const snapA = adapter.buildSnapshot({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, rig);
    // Cosmetics are not inputs to buildSnapshot — FOV stays base, aspect is mission 16:9.
    expect(snapA.projection.aspectRatio).toBe(MISSION_CAPTURE_ASPECT_RATIO);
    expect(snapA.projection.verticalFovDegrees).toBe(LEGACY_FPV_BASE_FOV_DEGREES);
    expect(snapA.projection.aspectRatio).not.toBe(window.devicePixelRatio);
  });

  it('Three adapter applies cosmetics after base pose', () => {
    const rig = resolver.resolve({
      aircraft: stubAircraft(),
      appliedFpvCameraTiltRad: 0,
    });
    const base = threeFlightCameraViewAdapter.computeBasePose({
      aircraftPosition: { x: 0, y: 1, z: 0 },
      aircraftOrientation: { x: 0, y: 0, z: 0, w: 1 },
      rig,
    });
    expect(base.position.y).toBeCloseTo(1.12, 9);
    expect(base.baseFovDegrees).toBe(75);
    // Cosmetic FOV offset is not part of authoritative base.
    expect(base.baseFovDegrees).not.toBe(75 + 5);
  });

  it('active session resolves one authoritative rig', () => {
    const adapter = TestBed.inject(FlightCameraSnapshotAdapter);
    const rig1 = adapter.resolveAndActivate({
      aircraft: stubAircraft(),
      appliedFpvCameraTiltRad: FLIGHT_CONFIG.fpvCameraTilt,
    });
    expect(adapter.getActiveRig()).toBe(rig1);
    const rig2 = adapter.resolveAndActivate({
      aircraft: stubAircraft({ id: 'other' as AircraftDefinition['id'] }),
      appliedFpvCameraTiltRad: FLIGHT_CONFIG.fpvCameraTilt,
    });
    expect(adapter.getActiveRig()).toBe(rig2);
    expect(adapter.getActiveRig()?.rigId).not.toBe(rig1.rigId);
  });
});
