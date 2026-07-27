import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asElapsedTicks, asSimulationTick, IDENTITY_QUAT, PROJECTION_MODEL_VERSION } from '@fpv/simulation-contracts';
import {
  asPhotoCaptureEvidenceId,
  asPhotographyObjectiveId,
  asSubjectId,
  createDefaultPhotographyScoringPolicy,
  createPhotoCaptureEvidence,
  EVIDENCE_SCHEMA_VERSION,
  evaluatePhotoCapture,
  FEEDBACK_CODES,
  findForbiddenAircraftSnapshotKeys,
  projectSubjectBounds,
  projectWorldPoint,
  validatePhotographyObjective,
  type PhotographyObjectiveDefinition,
} from './index';

const SRC_DIR = __dirname;

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

describe('photography-domain: import-boundary guard', () => {
  const forbiddenImportPatterns = [
    "from '@angular/",
    "from 'three'",
    "from '@dimforge/rapier3d-compat'",
    "from '@fpv/mission-domain'",
    "from '@fpv/location-domain'",
  ];

  it('never imports Angular, Three.js, Rapier, mission-domain, or location-domain', () => {
    // Scans actual `import ... from '<module>'` specifiers only — doc
    // comments are allowed to *mention* these package names (e.g. to
    // explain why they are NOT imported).
    const files = collectSourceFiles(SRC_DIR).filter((f) => !f.endsWith('.spec.ts'));
    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      for (const pattern of forbiddenImportPatterns) {
        expect(contents.includes(pattern), `${file} must not import "${pattern}"`).toBe(false);
      }
    }
  });

  it('only imports from @fpv/simulation-contracts among @fpv/* packages', () => {
    const files = collectSourceFiles(SRC_DIR).filter((f) => !f.endsWith('.spec.ts'));
    const fpvImportPattern = /from ['"](@fpv\/[a-z0-9-]+)['"]/g;
    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = fpvImportPattern.exec(contents)) !== null) {
        expect(match[1], `${file} imports unexpected @fpv package ${match[1]}`).toBe('@fpv/simulation-contracts');
      }
    }
  });
});

describe('photography-domain: evidence excludes controller fields', () => {
  it('findForbiddenAircraftSnapshotKeys flags controller-shaped keys defensively', () => {
    const flagged = findForbiddenAircraftSnapshotKeys({
      aircraftId: 'a',
      stickInputYaw: 0.5,
      controllerCalibrationOffset: 1,
    });
    expect(flagged).toContain('stickInputYaw');
    expect(flagged).toContain('controllerCalibrationOffset');
  });

  it('findForbiddenAircraftSnapshotKeys reports nothing for a clean snapshot', () => {
    expect(findForbiddenAircraftSnapshotKeys({ aircraftId: 'a', altitudeMeters: 10 })).toHaveLength(0);
  });
});

describe('photography-domain: smoke test — end to end', () => {
  const objectiveId = asPhotographyObjectiveId('smoke-objective');
  const subjectId = asSubjectId('smoke-subject');
  const stabilityTicks = asElapsedTicks(30);

  function buildObjective(): PhotographyObjectiveDefinition {
    return {
      objectiveId,
      version: '1.0.0',
      requiredSubjectIds: [subjectId],
      minRequiredSubjectCount: 1,
      primarySubjectIds: [subjectId],
      visibilityMin: 0.5,
      coverageRange: { min: 0.05, max: 0.5 },
      centeringTarget: { targetAnchor: { u: 0.5, v: 0.5 }, maxCenteringError: 0.2 },
      cameraToSubjectDistanceRange: { min: 2, max: 30 },
      viewingAngleRangeDeg: { min: 0, max: 45 },
      allowedViewingSides: ['front', 'left', 'right'],
      altitudeRange: { minMeters: 0, maxMeters: 100 },
      lineOfSightMin: 0.5,
      obstructionMax: 0.5,
      maxLinearSpeedMps: 10,
      maxBodyAngularSpeedRadps: 5,
      stabilityDurationTicks: stabilityTicks,
      attemptPolicy: { retryable: true },
    };
  }

  it('projects a world point, builds evidence, validates the objective, and scores the capture', () => {
    const cameraPose = { position: { x: 0, y: 10, z: 0 }, orientation: IDENTITY_QUAT };
    const cameraSnapshotForProjection = {
      worldPose: cameraPose,
      projection: {
        verticalFovDegrees: 90,
        aspectRatio: 16 / 9,
        nearMeters: 0.1,
        farMeters: 500,
        projectionModelVersion: PROJECTION_MODEL_VERSION,
      },
    };

    const projected = projectWorldPoint({ x: 0, y: 10, z: -10 }, cameraSnapshotForProjection);
    expect(projected.ok).toBe(true);

    const bounds = projectSubjectBounds(
      {
        kind: 'aabb',
        aabb: { min: { x: -1, y: 9, z: -11 }, max: { x: 1, y: 11, z: -9 } },
      },
      cameraSnapshotForProjection,
    );
    expect(bounds.ok).toBe(true);

    const objective = buildObjective();
    const validation = validatePhotographyObjective(objective);
    expect(validation.ok).toBe(true);

    const evidenceResult = createPhotoCaptureEvidence({
      identity: {
        evidenceId: asPhotoCaptureEvidenceId('smoke-evidence'),
        schemaVersion: EVIDENCE_SCHEMA_VERSION,
        missionId: 'smoke-mission',
        missionVersion: '1.0.0',
        missionSessionId: 'smoke-session',
        sessionGeneration: 1,
        objectiveId,
        objectiveVersion: '1.0.0',
        attemptNumber: 1,
        locationId: 'smoke-location',
        locationVersion: '1.0.0',
        locationGeneration: 1,
        capturedAtTick: asSimulationTick(10),
        missionElapsedTicks: asElapsedTicks(10),
        scoringPolicyVersion: '1.0.0',
      },
      aircraftSnapshot: {
        aircraftId: 'smoke-aircraft',
        aircraftSourceType: 'factory',
        definitionVersion: '1.0.0',
        physicsProfileVersion: '1.0.0',
        runtimeCompatibilityVersion: '1.3.0-runtime-c3',
        pose: cameraPose,
        linearVelocityMps: { x: 0, y: 0, z: 0 },
        bodyAngularVelocityRadps: { x: 0, y: 0, z: 0 },
        altitudeMeters: 10,
        armed: true,
        crashed: false,
      },
      cameraSnapshot: {
        rigId: 'smoke-rig',
        rigVersion: '1.0.0',
        resolutionStrategy: 'aircraft-profile-v1',
        worldPose: cameraPose,
        projection: cameraSnapshotForProjection.projection,
        cameraMode: 'fpv',
        cosmeticEffectsExcluded: true,
        templateDerivedCamera: false,
      },
      spatialContext: { lineOfSightRatio: 1, obstructionRatio: 0 },
      subjectObservations: [
        {
          subjectId,
          boundsVersion: '1.0.0',
          visible: true,
          visibleSampleCount: 4,
          totalSampleCount: 4,
          visibilityRatio: 1,
          obstructionRatio: 0,
          projectedAnchor: { u: 0.5, v: 0.5 },
          screenRectangle: { minU: 0.4, minV: 0.4, maxU: 0.6, maxV: 0.6 },
          inFrontOfCamera: true,
          centeringError: 0,
          distanceMeters: 10,
          viewingAngleDeg: 0,
          viewingSide: 'front',
          coverageRatio: 0.1,
          frameIntersectionRatio: 1,
        },
      ],
      stability: {
        linearSpeedMps: 0,
        angularSpeedRadps: 0,
        stableDurationTicks: stabilityTicks,
        requiredDurationTicks: stabilityTicks,
        isStable: true,
      },
    });
    expect(evidenceResult.ok).toBe(true);
    if (!evidenceResult.ok) return;

    const policy = createDefaultPhotographyScoringPolicy();
    const evaluation = evaluatePhotoCapture(evidenceResult.value, objective, policy);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.scoringPolicyVersion).toBe(policy.policyVersion);
    expect(evaluation.components).toHaveLength(11);
  });

  it('validatePhotographyObjective never throws on malformed input', () => {
    expect(() => validatePhotographyObjective({} as unknown as PhotographyObjectiveDefinition)).not.toThrow();
    const report = validatePhotographyObjective({} as unknown as PhotographyObjectiveDefinition);
    expect(report.ok).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });

  it('exposes a stable, exhaustive feedback code vocabulary', () => {
    expect(FEEDBACK_CODES).toContain('SUBJECT_NOT_VISIBLE');
    expect(FEEDBACK_CODES).toContain('BONUS_COMPOSITION');
    expect(FEEDBACK_CODES.length).toBe(11);
  });
});
