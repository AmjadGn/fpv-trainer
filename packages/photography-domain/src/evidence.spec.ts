import { describe, expect, it } from 'vitest';
import { asElapsedTicks, asSimulationTick } from '@fpv/simulation-contracts';
import { asPhotoCaptureEvidenceId } from './ids';
import {
  createPhotoCaptureEvidence,
  EVIDENCE_SCHEMA_VERSION,
  type PhotoCaptureEvidence,
} from './evidence';
import { baseEvidenceInput, buildEvidence } from './evidence-fixtures';

describe('PhotoCaptureEvidence schema v2', () => {
  it('constructs deeply immutable evidence with durable identity', () => {
    const evidence = buildEvidence();
    expect(evidence.identity.schemaVersion).toBe('2.0.0');
    expect(evidence.identity.schemaVersion).toBe(EVIDENCE_SCHEMA_VERSION);
    expect(evidence.identity.missionId).toBe('mission-golden');
    expect(evidence.identity.locationGeneration).toBe(1);
    expect(evidence.identity.sessionGeneration).toBe(1);
    expect(evidence.aircraftSnapshot.aircraftSourceType).toBe('factory');
    expect(evidence.cameraSnapshot.rigId).toBe('test-rig');
    expect(evidence.cameraSnapshot.cosmeticEffectsExcluded).toBe(true);
    expect(evidence.subjectObservations[0]!.visibleSampleCount).toBe(4);
    expect(evidence.subjectObservations[0]!.totalSampleCount).toBe(4);
    expect(evidence.stability.linearSpeedMps).toBe(0);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.aircraftSnapshot.pose)).toBe(true);
    expect(Object.isFrozen(evidence.aircraftSnapshot.pose.position)).toBe(true);
    expect(Object.isFrozen(evidence.cameraSnapshot.worldPose.orientation)).toBe(true);
    expect(Object.isFrozen(evidence.subjectObservations)).toBe(true);
    expect(Object.isFrozen(evidence.subjectObservations[0]!.screenRectangle)).toBe(true);
    expect(Object.isFrozen(evidence.subjectObservations[0]!.projectedAnchor)).toBe(true);
    expect(Object.isFrozen(evidence.stability)).toBe(true);
  });

  it('rejects mutation attempts against nested pose / rectangle / stability fields', () => {
    const evidence = buildEvidence() as PhotoCaptureEvidence & {
      aircraftSnapshot: {
        pose: { position: { x: number; y: number; z: number } };
      };
      cameraSnapshot: { worldPose: { position: { x: number } } };
      subjectObservations: Array<{
        screenRectangle: { minU: number } | null;
        projectedAnchor: { u: number } | null;
      }>;
      stability: { linearSpeedMps: number };
    };

    expect(() => {
      (evidence.aircraftSnapshot.pose.position as { x: number }).x = 999;
    }).toThrow();
    expect(() => {
      (evidence.cameraSnapshot.worldPose.position as { x: number }).x = 999;
    }).toThrow();
    expect(() => {
      (evidence.subjectObservations as unknown as SubjectObservationMutable[]).push({} as never);
    }).toThrow();
    expect(() => {
      const rect = evidence.subjectObservations[0]!.screenRectangle;
      if (rect) {
        (rect as { minU: number }).minU = 0;
      }
    }).toThrow();
    expect(() => {
      const anchor = evidence.subjectObservations[0]!.projectedAnchor;
      if (anchor) {
        (anchor as { u: number }).u = 0;
      }
    }).toThrow();
    expect(() => {
      (evidence.stability as { linearSpeedMps: number }).linearSpeedMps = 99;
    }).toThrow();

    expect(evidence.aircraftSnapshot.pose.position.x).toBe(0);
    expect(evidence.stability.linearSpeedMps).toBe(0);
  });

  it('rejects evidence schema/version mismatch', () => {
    const result = createPhotoCaptureEvidence(
      baseEvidenceInput({
        identity: {
          ...baseEvidenceInput().identity,
          schemaVersion: '1.0.0',
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/schemaVersion/);
  });

  it('rejects missing required mission/location context', () => {
    const missingMission = createPhotoCaptureEvidence(
      baseEvidenceInput({
        identity: {
          ...baseEvidenceInput().identity,
          missionId: '',
        },
      }),
    );
    expect(missingMission.ok).toBe(false);

    const missingLocation = createPhotoCaptureEvidence(
      baseEvidenceInput({
        identity: {
          ...baseEvidenceInput().identity,
          locationId: '',
        },
      }),
    );
    expect(missingLocation.ok).toBe(false);
  });

  it('rejects non-finite metadata', () => {
    const result = createPhotoCaptureEvidence(
      baseEvidenceInput({
        aircraftSnapshot: {
          ...baseEvidenceInput().aircraftSnapshot,
          altitudeMeters: Number.NaN,
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects non-positive attempt numbers and negative generations', () => {
    expect(
      createPhotoCaptureEvidence(
        baseEvidenceInput({
          identity: { ...baseEvidenceInput().identity, attemptNumber: 0 },
        }),
      ).ok,
    ).toBe(false);
    expect(
      createPhotoCaptureEvidence(
        baseEvidenceInput({
          identity: { ...baseEvidenceInput().identity, sessionGeneration: -1 },
        }),
      ).ok,
    ).toBe(false);
  });

  it('serializes identically across 200 golden rebuilds', () => {
    const first = JSON.stringify(buildEvidence());
    for (let i = 0; i < 200; i += 1) {
      expect(JSON.stringify(buildEvidence())).toBe(first);
    }
  });

  it('keeps subject observation order stable in serialization', () => {
    const evidence = buildEvidence();
    const parsed = JSON.parse(JSON.stringify(evidence)) as PhotoCaptureEvidence;
    expect(parsed.subjectObservations.map((o) => String(o.subjectId))).toEqual([
      'subject-a',
      'subject-b',
    ]);
  });

  it('records exact visibility sample counts without reconstructing from a rounded ratio', () => {
    const evidence = buildEvidence({
      subjectObservations: [
        {
          ...baseEvidenceInput().subjectObservations[0]!,
          visibleSampleCount: 3,
          totalSampleCount: 4,
          visibilityRatio: 0.75,
          obstructionRatio: 0.25,
        },
        baseEvidenceInput().subjectObservations[1]!,
      ],
    });
    expect(evidence.subjectObservations[0]!.visibleSampleCount).toBe(3);
    expect(evidence.subjectObservations[0]!.totalSampleCount).toBe(4);
    expect(evidence.subjectObservations[0]!.visibilityRatio).toBe(0.75);
  });

  it('accepts missionElapsedTicks distinct from capturedAtTick', () => {
    const evidence = buildEvidence({
      identity: {
        ...baseEvidenceInput().identity,
        evidenceId: asPhotoCaptureEvidenceId('evidence-elapsed'),
        capturedAtTick: asSimulationTick(500),
        missionElapsedTicks: asElapsedTicks(420),
      },
    });
    expect(evidence.identity.capturedAtTick as unknown as number).toBe(500);
    expect(evidence.identity.missionElapsedTicks as unknown as number).toBe(420);
  });
});

interface SubjectObservationMutable {
  subjectId: string;
}
