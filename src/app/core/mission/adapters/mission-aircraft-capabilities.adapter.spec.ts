import { TestBed } from '@angular/core/testing';

import type { AircraftDefinition } from '../../aircraft/models/aircraft-definition.model';
import { MissionAircraftCapabilitiesAdapter } from './mission-aircraft-capabilities.adapter';
import { MissionAircraftSnapshotAdapter } from './mission-aircraft-snapshot.adapter';
import { UnavailableMissionSpatialQueryAdapter } from './unavailable-mission-spatial-query.adapter';
import { FLIGHT_CONFIG } from '../../flight/config/flight-config';

function baseAircraft(tags: string[] = []): AircraftDefinition {
  return {
    id: 'ac-1' as AircraftDefinition['id'],
    slug: 'ac-1',
    displayName: 'AC1',
    manufacturerName: 'Test',
    fictionalManufacturer: true,
    category: 'freestyle-5inch',
    generation: 1,
    releaseStatus: 'available',
    description: '',
    shortDescription: '',
    tags,
    referenceProfileId: null,
    referenceCategory: 'freestyle',
    derivedFromPublicSpecifications: false,
    physicsAccuracyLabel: '',
    legalNotes: '',
    widthMeters: 0.3,
    lengthMeters: 0.3,
    heightMeters: 0.1,
    wheelbaseMeters: 0.25,
    propellerDiameterMeters: 0.13,
    ductDiameterMeters: null,
    dryMassKg: 0.4,
    batteryMassKg: 0.2,
    takeoffMassKg: 0.6,
    centerOfMassOffset: { x: 0, y: 0, z: 0 },
    centerOfMassHeight: 0.02,
    nominalVoltage: 16.8,
    batteryCellCount: 4,
    batteryCapacityMah: 1500,
    maximumThrustNewtons: 25,
    hoverThrottleRatio: 0.45,
    thrustToWeightRatio: 4.2,
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
    maximumForwardSpeed: 28,
    maximumClimbSpeed: 12,
    maximumDescentSpeed: 12,
    brakingStrength: 0.5,
    recoveryStrength: 0.5,
    flightProfile: {} as AircraftDefinition['flightProfile'],
    cameraProfile: {
      id: 'cam',
      version: '1',
      fpv: {
        localPosition: { x: 0, y: 0.12, z: -0.18 },
        cameraAngleDeg: 8,
        angleRangeDeg: { min: 0, max: 40 },
        defaultFov: 75,
        minFov: 60,
        maxFov: 110,
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
    difficulty: 2,
    recommendedSkillLevel: 'intermediate',
    recommendedModes: [],
    recommendedEnvironments: [],
    unlockPolicy: 'default',
    isAvailableByDefault: true,
    definitionVersion: '2.0.0',
    physicsProfileVersion: '2.0.0',
    colliderVersion: '1.0.0',
    visualVersion: '1.0.0',
    audioVersion: '1.0.0',
  };
}

describe('MissionAircraftCapabilitiesAdapter', () => {
  let adapter: MissionAircraftCapabilitiesAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MissionAircraftCapabilitiesAdapter],
    });
    adapter = TestBed.inject(MissionAircraftCapabilitiesAdapter);
  });

  it('maps factory aircraft capabilities without inventing endurance', () => {
    const result = adapter.adapt(baseAircraft());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.capabilities.sourceType).toBe('factory');
    expect(result.capabilities.category).toBe('freestyle-5inch');
    expect(result.capabilities.widthMeters).toBe(0.3);
    expect(result.capabilities.heightMeters).toBe(0.1);
    expect(result.capabilities.takeoffMassKg).toBe(0.6);
    expect(result.capabilities.thrustToWeight).toBe(4.2);
    expect(result.capabilities.hasCamera).toBe(true);
    expect(result.capabilities.cameraProfileCapability?.minFovDeg).toBe(60);
    expect(result.capabilities.cameraProfileCapability?.maxFovDeg).toBe(110);
    expect(result.capabilities.cameraProfileCapability?.provenance).toBe('runtime');
    expect(result.capabilities.collisionProfileAvailable).toBe(true);
    expect(result.capabilities.collisionProvenance).toBe('runtime');
    expect(result.capabilities.runtimeCompatibilityVersion).toBe('2.0.0');
    expect(result.capabilities.estimatedEnduranceMinutes).toBeUndefined();
    expect(JSON.stringify(result.capabilities)).not.toMatch(/yawInverted|calibration|controller/i);
  });

  it('maps compiled aircraft with template-derived provenance warnings', () => {
    const result = adapter.adapt(baseAircraft(['user-build', 'compiled']));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.capabilities.sourceType).toBe('user-compiled');
    expect(result.capabilities.cameraProfileCapability?.provenance).toBe(
      'template-derived',
    );
    expect(result.capabilities.collisionProvenance).toBe('template-derived');
    expect(result.warnings.some((w) => w.includes('template-derived'))).toBe(true);
  });
});

describe('MissionAircraftSnapshotAdapter', () => {
  let adapter: MissionAircraftSnapshotAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MissionAircraftSnapshotAdapter],
    });
    adapter = TestBed.inject(MissionAircraftSnapshotAdapter);
  });

  it('builds immutable snapshot and detects stale session', () => {
    const result = adapter.adapt({
      simulationTick: 3,
      fixedStepSeconds: FLIGHT_CONFIG.physicsStep,
      sessionGeneration: 2,
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0.1, y: 0, z: 0 },
      bodyAngularVelocity: { pitch: 0.01, yaw: 0.02, roll: 0.03 },
      armed: true,
      crashed: false,
      altitudeMeters: 2,
      speedMps: 0.1,
      aircraftId: 'ac-1',
      aircraftSourceType: 'factory',
      definitionVersion: '1',
      physicsProfileVersion: '1',
      collisionOutcome: 'none',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.snapshot.simulationTick).toBe(3);
    expect(result.snapshot.bodyAngularVelocity.yaw).toBe(0.02);
    expect(adapter.isStale(result.snapshot, 2)).toBe(false);
    expect(adapter.isStale(result.snapshot, 1)).toBe(true);
  });

  it('rejects non-finite values', () => {
    const result = adapter.adapt({
      simulationTick: 1,
      fixedStepSeconds: FLIGHT_CONFIG.physicsStep,
      sessionGeneration: 1,
      position: { x: Number.NaN, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      bodyAngularVelocity: { pitch: 0, yaw: 0, roll: 0 },
      armed: false,
      crashed: false,
      altitudeMeters: 0,
      speedMps: 0,
      aircraftId: 'ac-1',
      aircraftSourceType: 'factory',
      definitionVersion: null,
      physicsProfileVersion: null,
      collisionOutcome: 'none',
    });
    expect(result.ok).toBe(false);
  });
});

describe('UnavailableMissionSpatialQueryAdapter', () => {
  it('never reports clear line of sight when unavailable', () => {
    const adapter = new UnavailableMissionSpatialQueryAdapter();
    expect(adapter.isAvailable()).toBe(false);
    const los = adapter.queryLineOfSight({
      startWorld: { x: 0, y: 0, z: 0 },
      endWorld: { x: 0, y: 0, z: -10 },
    });
    expect(los.status).toBe('unavailable');
    expect(los.unobstructed).toBeNull();
    expect(los.diagnosticCode).toBe('SPATIAL_QUERY_UNAVAILABLE');

    const vis = adapter.queryVisibilitySamples({
      originWorld: { x: 0, y: 1, z: 0 },
      samplePointsWorld: [
        { x: 0, y: 1, z: -1 },
        { x: 1, y: 1, z: -1 },
      ],
    });
    expect(vis.visibleFraction).toBeNull();
    expect(vis.sampleCount).toBe(2);
  });
});
