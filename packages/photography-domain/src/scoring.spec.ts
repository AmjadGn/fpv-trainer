import { describe, expect, it } from 'vitest';
import { asPositionZoneId } from './ids';
import type { PhotoCaptureEvidenceInput } from './evidence';
import {
  OBJECTIVE_ID,
  SUBJECT_A,
  SUBJECT_B,
  STABILITY_TICKS,
  baseEvidenceInput,
  buildEvidence,
} from './evidence-fixtures';
import type { PhotographyObjectiveDefinition } from './objective';
import { createDefaultPhotographyScoringPolicy, type PhotographyScoringPolicy } from './scoring-policy';
import { evaluatePhotoCapture, type PhotoEvaluationResult } from './scoring';

function baseObjective(overrides: Partial<PhotographyObjectiveDefinition> = {}): PhotographyObjectiveDefinition {
  return {
    objectiveId: OBJECTIVE_ID,
    version: '1.0.0',
    requiredSubjectIds: [SUBJECT_A, SUBJECT_B],
    minRequiredSubjectCount: 1,
    primarySubjectIds: [SUBJECT_A],
    secondarySubjectIds: [SUBJECT_B],
    visibilityMin: 0.6,
    coverageRange: { min: 0.1, max: 0.4 },
    centeringTarget: { targetAnchor: { u: 0.5, v: 0.5 }, maxCenteringError: 0.15 },
    cameraToSubjectDistanceRange: { min: 5, max: 20 },
    viewingAngleRangeDeg: { min: 0, max: 30 },
    allowedViewingSides: ['front'],
    altitudeRange: { minMeters: 5, maxMeters: 50 },
    lineOfSightMin: 0.8,
    obstructionMax: 0.2,
    maxLinearSpeedMps: 3,
    maxBodyAngularSpeedRadps: 1,
    stabilityDurationTicks: STABILITY_TICKS,
    attemptPolicy: { retryable: true },
    ...overrides,
  };
}

const POLICY: PhotographyScoringPolicy = createDefaultPhotographyScoringPolicy();

function evaluate(
  objective: PhotographyObjectiveDefinition,
  evidenceOverrides: Partial<PhotoCaptureEvidenceInput> = {},
  policy: PhotographyScoringPolicy = POLICY,
): PhotoEvaluationResult {
  return evaluatePhotoCapture(buildEvidence(evidenceOverrides), objective, policy);
}

describe('scoring golden 1: perfect centered capture', () => {
  it('passes with a high normalized score and no hard failures', () => {
    const result = evaluate(baseObjective());
    expect(result.passed).toBe(true);
    expect(result.hardFailureReasons).toHaveLength(0);
    expect(result.normalizedScore).toBeGreaterThan(0.8);
    expect(result.feedbackCodes).toContain('EXCELLENT_FRAMING');
  });
});

describe('scoring golden 2: frame edge (subject slightly cropped)', () => {
  it('passes but scores framing below the maximum', () => {
    const result = evaluate(baseObjective(), {
      subjectObservations: [
        { ...baseEvidenceInput().subjectObservations[0], frameIntersectionRatio: 0.9 },
        baseEvidenceInput().subjectObservations[1],
      ],
    });
    expect(result.passed).toBe(true);
    const framing = result.components.find((c) => c.componentId === 'framing')!;
    expect(framing.rawScore).toBeLessThan(framing.maxScore);
    expect(framing.rawScore).toBeGreaterThan(0);
  });
});

describe('scoring golden 3: partial outside frame', () => {
  it('still passes hard requirements but scores framing near the middle of the range', () => {
    const result = evaluate(baseObjective(), {
      subjectObservations: [
        { ...baseEvidenceInput().subjectObservations[0], frameIntersectionRatio: 0.5 },
        baseEvidenceInput().subjectObservations[1],
      ],
    });
    expect(result.passed).toBe(true);
    const framing = result.components.find((c) => c.componentId === 'framing')!;
    expect(framing.rawScore).toBeCloseTo(framing.maxScore * 0.5, 0);
  });
});

describe('scoring golden 4: too close', () => {
  it('hard-fails distance and suggests MOVE_FARTHER', () => {
    const result = evaluate(baseObjective(), {
      subjectObservations: [
        { ...baseEvidenceInput().subjectObservations[0], distanceMeters: 2 },
        baseEvidenceInput().subjectObservations[1],
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailureReasons.some((r) => r.startsWith('distance'))).toBe(true);
    expect(result.feedbackCodes).toContain('MOVE_FARTHER');
  });
});

describe('scoring golden 5: too far', () => {
  it('hard-fails distance and suggests MOVE_CLOSER', () => {
    const result = evaluate(baseObjective(), {
      subjectObservations: [
        { ...baseEvidenceInput().subjectObservations[0], distanceMeters: 100 },
        baseEvidenceInput().subjectObservations[1],
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailureReasons.some((r) => r.startsWith('distance'))).toBe(true);
    expect(result.feedbackCodes).toContain('MOVE_CLOSER');
  });
});

describe('scoring golden 6: wrong viewing side', () => {
  it('hard-fails viewing side', () => {
    const result = evaluate(baseObjective(), {
      subjectObservations: [
        { ...baseEvidenceInput().subjectObservations[0], viewingSide: 'back' },
        baseEvidenceInput().subjectObservations[1],
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailureReasons.some((r) => r.startsWith('viewingSide'))).toBe(true);
    expect(result.feedbackCodes).toContain('WRONG_VIEWING_SIDE');
  });
});

describe('scoring golden 7: fully occluded (line of sight blocked)', () => {
  it('hard-fails line of sight', () => {
    const result = evaluate(baseObjective(), {
      spatialContext: { lineOfSightRatio: 0, obstructionRatio: 1 },
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailureReasons.some((r) => r.startsWith('lineOfSight'))).toBe(true);
    expect(result.feedbackCodes).toContain('VIEW_OBSTRUCTED');
  });
});

describe('scoring golden 8: partially obstructed (still within tolerance)', () => {
  it('passes but scores lineOfSight below the maximum', () => {
    const result = evaluate(baseObjective(), {
      spatialContext: { lineOfSightRatio: 0.85, obstructionRatio: 0.15 },
    });
    expect(result.passed).toBe(true);
    const los = result.components.find((c) => c.componentId === 'lineOfSight')!;
    expect(los.rawScore).toBeLessThan(los.maxScore);
  });
});

describe('scoring golden 9: high angular velocity', () => {
  it('hard-fails stability and suggests HOLD_STEADY', () => {
    const result = evaluate(baseObjective(), {
      aircraftSnapshot: { ...baseEvidenceInput().aircraftSnapshot, bodyAngularVelocityRadps: { x: 0, y: 0, z: 2 } },
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailureReasons.some((r) => r.startsWith('stability'))).toBe(true);
    expect(result.feedbackCodes).toContain('HOLD_STEADY');
  });
});

describe('scoring golden 10: stable capture', () => {
  it('awards full stability score when duration and speed are within thresholds', () => {
    const result = evaluate(baseObjective());
    const stability = result.components.find((c) => c.componentId === 'stability')!;
    expect(stability.rawScore).toBe(stability.maxScore);
  });
});

describe('scoring golden 11: multi-subject, one missing', () => {
  it('hard-fails subject visibility when a required (non-primary) subject required by minRequiredSubjectCount is missing', () => {
    const objective = baseObjective({ minRequiredSubjectCount: 2 });
    const result = evaluate(objective, {
      subjectObservations: [
        baseEvidenceInput().subjectObservations[0],
        { ...baseEvidenceInput().subjectObservations[1], visible: false, visibilityRatio: 0 },
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailureReasons.some((r) => r.startsWith('subjectVisibility'))).toBe(true);
    expect(result.feedbackCodes).toContain('SUBJECT_NOT_VISIBLE');
  });
});

describe('scoring golden 12: outside required position zone', () => {
  it('hard-fails positionZone', () => {
    const objective = baseObjective({ requiredAircraftPositionZoneId: asPositionZoneId('zone-a') });
    const result = evaluate(objective, {
      aircraftSnapshot: { ...baseEvidenceInput().aircraftSnapshot, positionZoneId: asPositionZoneId('zone-b') },
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailureReasons.some((r) => r.startsWith('positionZone'))).toBe(true);
  });
});

describe('scoring golden 13: exact thresholds (inclusive boundaries)', () => {
  it('passes when distance/altitude/angular-speed sit exactly on their boundary values', () => {
    const objective = baseObjective();
    const result = evaluate(objective, {
      aircraftSnapshot: {
        ...baseEvidenceInput().aircraftSnapshot,
        altitudeMeters: 5, // exactly altitudeRange.minMeters
        bodyAngularVelocityRadps: { x: 0, y: 0, z: 1 }, // exactly maxBodyAngularSpeedRadps
      },
      subjectObservations: [
        { ...baseEvidenceInput().subjectObservations[0], distanceMeters: 5 }, // exactly range.min
        baseEvidenceInput().subjectObservations[1],
      ],
    });
    expect(result.passed).toBe(true);
    const distanceComponent = result.components.find((c) => c.componentId === 'distance')!;
    expect(distanceComponent.rawScore).toBe(distanceComponent.maxScore);
    const altitudeComponent = result.components.find((c) => c.componentId === 'altitude')!;
    expect(altitudeComponent.rawScore).toBe(altitudeComponent.maxScore);
  });
});

describe('scoring golden 14: bonus composition', () => {
  it('awards bonus points and the BONUS_COMPOSITION feedback code when a bonus condition is met', () => {
    const objective = baseObjective({
      bonusConditions: [{ id: 'coverage-bonus', kind: 'coverage-above', thresholdValue: 0.15, scoreBonus: 5 }],
    });
    const result = evaluate(objective);
    expect(result.passed).toBe(true);
    const bonus = result.components.find((c) => c.componentId === 'bonus')!;
    expect(bonus.rawScore).toBeGreaterThan(0);
    expect(result.feedbackCodes).toContain('BONUS_COMPOSITION');
  });

  it('awards no bonus when the underlying capture hard-fails', () => {
    const objective = baseObjective({
      bonusConditions: [{ id: 'coverage-bonus', kind: 'coverage-above', thresholdValue: 0.15, scoreBonus: 5 }],
    });
    const result = evaluate(objective, {
      subjectObservations: [
        { ...baseEvidenceInput().subjectObservations[0], distanceMeters: 100 },
        baseEvidenceInput().subjectObservations[1],
      ],
    });
    expect(result.passed).toBe(false);
    const bonus = result.components.find((c) => c.componentId === 'bonus')!;
    expect(bonus.rawScore).toBe(0);
  });
});

describe('scoring golden 15: identical evidence repeated', () => {
  it('produces a byte-identical serialized result across two separate calls', () => {
    const evidence = buildEvidence();
    const objective = baseObjective();
    const first = JSON.stringify(evaluatePhotoCapture(evidence, objective, POLICY));
    const second = JSON.stringify(evaluatePhotoCapture(evidence, objective, POLICY));
    expect(first).toBe(second);
  });
});

describe('determinism: 200+ repeated evaluations per core scenario', () => {
  const scenarios: ReadonlyArray<{ readonly name: string; readonly run: () => PhotoEvaluationResult }> = [
    { name: 'perfect centered', run: () => evaluate(baseObjective()) },
    {
      name: 'frame edge',
      run: () =>
        evaluate(baseObjective(), {
          subjectObservations: [
            { ...baseEvidenceInput().subjectObservations[0], frameIntersectionRatio: 0.9 },
            baseEvidenceInput().subjectObservations[1],
          ],
        }),
    },
    {
      name: 'too close (hard failure)',
      run: () =>
        evaluate(baseObjective(), {
          subjectObservations: [
            { ...baseEvidenceInput().subjectObservations[0], distanceMeters: 2 },
            baseEvidenceInput().subjectObservations[1],
          ],
        }),
    },
    {
      name: 'wrong viewing side (hard failure)',
      run: () =>
        evaluate(baseObjective(), {
          subjectObservations: [
            { ...baseEvidenceInput().subjectObservations[0], viewingSide: 'back' },
            baseEvidenceInput().subjectObservations[1],
          ],
        }),
    },
    {
      name: 'bonus composition',
      run: () =>
        evaluate(
          baseObjective({ bonusConditions: [{ id: 'coverage-bonus', kind: 'coverage-above', thresholdValue: 0.15, scoreBonus: 5 }] }),
        ),
    },
  ];

  for (const scenario of scenarios) {
    it(`is identical across 200 evaluations: ${scenario.name}`, () => {
      const serializations = new Set<string>();
      for (let i = 0; i < 200; i += 1) {
        serializations.add(JSON.stringify(scenario.run()));
      }
      expect(serializations.size).toBe(1);
    });
  }
});
