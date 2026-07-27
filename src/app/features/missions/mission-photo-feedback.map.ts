/**
 * Presentation strings for photography feedback and mission failure codes.
 *
 * Strings only: nothing here decides whether a capture passed, what it
 * scored, or why a mission ended. The domain owns those codes; this module
 * only makes them readable to a pilot in flight.
 */

const FEEDBACK_TEXT: Readonly<Record<string, string>> = {
  SUBJECT_NOT_VISIBLE: 'Subject not in frame',
  MOVE_CLOSER: 'Move closer',
  MOVE_FARTHER: 'Back off',
  CENTER_SUBJECT: 'Center the subject',
  WRONG_VIEWING_SIDE: 'Shoot from an allowed side',
  TOO_LOW: 'Climb higher',
  TOO_HIGH: 'Drop lower',
  HOLD_STEADY: 'Hold steady',
  VIEW_OBSTRUCTED: 'View blocked — find a clear line',
  EXCELLENT_FRAMING: 'Excellent framing',
  BONUS_COMPOSITION: 'Bonus composition',
};

const FAILURE_REASON_TEXT: Readonly<Record<string, string>> = {
  AIRCRAFT_CRASHED: 'Aircraft crashed',
  OUT_OF_BOUNDS: 'Left the mission area',
};

const COMPONENT_LABEL: Readonly<Record<string, string>> = {
  visibility: 'Visibility',
  framing: 'Framing',
  centering: 'Centering',
  coverage: 'Coverage',
  distance: 'Distance',
  viewingAngle: 'Angle',
  altitude: 'Altitude',
  positionZone: 'Position',
  lineOfSight: 'Line of sight',
  stability: 'Stability',
  bonus: 'Bonus',
};

export function missionPhotoFeedbackText(code: string): string {
  return FEEDBACK_TEXT[code] ?? code;
}

export function missionPhotoFeedbackTexts(codes: readonly string[]): readonly string[] {
  return codes.map(missionPhotoFeedbackText);
}

export function missionFailureReasonText(code: string | null): string | null {
  if (code === null) {
    return null;
  }
  return FAILURE_REASON_TEXT[code] ?? code;
}

export function missionPhotoComponentLabel(componentId: string): string {
  return COMPONENT_LABEL[componentId] ?? componentId;
}

/** `m:ss` for HUD clocks and results durations. */
export function formatMissionDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
