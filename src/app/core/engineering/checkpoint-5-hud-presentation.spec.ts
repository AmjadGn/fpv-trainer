import { describe, expect, it } from 'vitest';

import { FEEDBACK_CODES, SCORING_COMPONENT_ORDER } from '@fpv/photography-domain';

import {
  formatMissionDuration,
  missionFailureReasonText,
  missionPhotoComponentLabel,
  missionPhotoFeedbackText,
  missionPhotoFeedbackTexts,
} from '../../features/missions/mission-photo-feedback.map';

/**
 * Checkpoint 5 — HUD / results presentation mappers.
 *
 * These are strings only: they must never invent a verdict, and must never
 * drop a domain code they do not recognise.
 */

describe('Checkpoint 5 — photography presentation mappers', () => {
  it('gives every domain feedback code a pilot-readable string', () => {
    for (const code of FEEDBACK_CODES) {
      const text = missionPhotoFeedbackText(code);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toBe(code);
    }
  });

  it('labels every scoring component in the policy order', () => {
    for (const componentId of SCORING_COMPONENT_ORDER) {
      const label = missionPhotoComponentLabel(componentId);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(componentId);
    }
  });

  it('passes unknown codes through untouched rather than hiding them', () => {
    expect(missionPhotoFeedbackText('SOME_FUTURE_CODE')).toBe('SOME_FUTURE_CODE');
    expect(missionPhotoComponentLabel('futureComponent')).toBe('futureComponent');
    expect(missionFailureReasonText('SOME_FUTURE_FAILURE')).toBe('SOME_FUTURE_FAILURE');
  });

  it('maps a feedback list in order and maps a null failure reason to null', () => {
    expect(missionPhotoFeedbackTexts(['TOO_LOW', 'HOLD_STEADY'])).toEqual([
      'Climb higher',
      'Hold steady',
    ]);
    expect(missionPhotoFeedbackTexts([])).toEqual([]);
    expect(missionFailureReasonText(null)).toBeNull();
    expect(missionFailureReasonText('AIRCRAFT_CRASHED')).toBe('Aircraft crashed');
    expect(missionFailureReasonText('OUT_OF_BOUNDS')).toBe('Left the mission area');
  });

  it('formats mission durations as m:ss and refuses non-finite input', () => {
    expect(formatMissionDuration(0)).toBe('0:00');
    expect(formatMissionDuration(9)).toBe('0:09');
    expect(formatMissionDuration(59.9)).toBe('0:59');
    expect(formatMissionDuration(60)).toBe('1:00');
    expect(formatMissionDuration(605)).toBe('10:05');
    expect(formatMissionDuration(-1)).toBe('0:00');
    expect(formatMissionDuration(Number.NaN)).toBe('0:00');
    expect(formatMissionDuration(Number.POSITIVE_INFINITY)).toBe('0:00');
  });

  it('derives elapsed seconds from authoritative ticks, not wall clock', () => {
    const fixedStepSeconds = 1 / 120;
    expect(formatMissionDuration(7_200 * fixedStepSeconds)).toBe('1:00');
    expect(formatMissionDuration(36_000 * fixedStepSeconds)).toBe('5:00');
  });
});
