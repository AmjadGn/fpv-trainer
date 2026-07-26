import { describe, expect, it } from 'vitest';
import { MISSION_CAPTURE_ASPECT_RATIO } from '@fpv/simulation-contracts';

import {
  buildCoastalRuinsCollisionDescriptors,
  SUBJECT_IDS,
} from '../../content/locations/mediterranean-expedition-region';

/**
 * Framing guide visibility for Checkpoint 4:
 * shipping path shows the guide only for an active photography objective;
 * development preview may force it on. Mission session active ≠ objective active.
 */
export function isFramingGuideVisible(options: {
  readonly photographyObjectiveActive: boolean;
  readonly developmentPreview: boolean;
}): boolean {
  return options.photographyObjectiveActive || options.developmentPreview;
}

/**
 * Mission presentation activation gate used by FlightComponent after successful prep.
 */
export function shouldActivateMissionSession(options: {
  readonly preparationOk: boolean;
  readonly prepareGeneration: number;
  readonly currentPrepareGeneration: number;
  readonly observerAttached: boolean;
}): boolean {
  if (!options.preparationOk) {
    return false;
  }
  if (options.prepareGeneration !== options.currentPrepareGeneration) {
    return false;
  }
  return options.observerAttached;
}

describe('Checkpoint 4 review corrections — presentation + ownership', () => {
  it('authoritative subject colliders carry stable subjectId metadata', () => {
    const descriptors = buildCoastalRuinsCollisionDescriptors();
    const byId = new Map(descriptors.map((d) => [d.id, d]));

    expect(byId.get('curated:arch-pillar-l')?.subjectId).toBe(SUBJECT_IDS.stoneSeaArch);
    expect(byId.get('curated:arch-pillar-r')?.subjectId).toBe(SUBJECT_IDS.stoneSeaArch);
    expect(byId.get('curated:arch-lintel')?.subjectId).toBe(SUBJECT_IDS.stoneSeaArch);
    expect(byId.get('curated:tower-base')?.subjectId).toBe(SUBJECT_IDS.ruinedLookout);
    expect(byId.get('curated:tower-shaft')?.subjectId).toBe(SUBJECT_IDS.ruinedLookout);
    expect(byId.get('curated:cliffside-wall')?.subjectId).toBe(SUBJECT_IDS.cliffsideRuin);

    expect(byId.get('curated:terrain-ground')?.subjectId).toBeUndefined();
    expect(byId.get('curated:wall-0')?.subjectId).toBeUndefined();
    expect(byId.get('curated:boundary-x-min')?.subjectId).toBeUndefined();
  });

  it('framing guide is hidden during generic mission preparation', () => {
    expect(
      isFramingGuideVisible({
        photographyObjectiveActive: false,
        developmentPreview: false,
      }),
    ).toBe(false);
  });

  it('framing guide appears only for explicit preview in Checkpoint 4', () => {
    expect(
      isFramingGuideVisible({
        photographyObjectiveActive: false,
        developmentPreview: true,
      }),
    ).toBe(true);
    expect(
      isFramingGuideVisible({
        photographyObjectiveActive: true,
        developmentPreview: false,
      }),
    ).toBe(true);
  });

  it('mission is not active during preparation or after failure/cancel/stale', () => {
    expect(
      shouldActivateMissionSession({
        preparationOk: false,
        prepareGeneration: 1,
        currentPrepareGeneration: 1,
        observerAttached: false,
      }),
    ).toBe(false);
    expect(
      shouldActivateMissionSession({
        preparationOk: true,
        prepareGeneration: 1,
        currentPrepareGeneration: 2,
        observerAttached: true,
      }),
    ).toBe(false);
    expect(
      shouldActivateMissionSession({
        preparationOk: true,
        prepareGeneration: 3,
        currentPrepareGeneration: 3,
        observerAttached: false,
      }),
    ).toBe(false);
  });

  it('successful runtime preparation activates mission only after observer attach', () => {
    expect(
      shouldActivateMissionSession({
        preparationOk: true,
        prepareGeneration: 4,
        currentPrepareGeneration: 4,
        observerAttached: true,
      }),
    ).toBe(true);
  });

  it('teardown hides framing guide immediately', () => {
    expect(
      isFramingGuideVisible({
        photographyObjectiveActive: false,
        developmentPreview: false,
      }),
    ).toBe(false);
  });

  it('preserves MISSION_CAPTURE_ASPECT_RATIO for framing geometry', () => {
    expect(MISSION_CAPTURE_ASPECT_RATIO).toBeCloseTo(16 / 9);
  });
});
