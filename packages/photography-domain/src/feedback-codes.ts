/**
 * Photography scoring feedback vocabulary.
 *
 * Kept in its own module (no dependency on `objective.ts` or `scoring.ts`)
 * so both can reference `FeedbackCode` without an import cycle.
 */

export type FeedbackCode =
  | 'SUBJECT_NOT_VISIBLE'
  | 'MOVE_CLOSER'
  | 'MOVE_FARTHER'
  | 'CENTER_SUBJECT'
  | 'WRONG_VIEWING_SIDE'
  | 'TOO_LOW'
  | 'TOO_HIGH'
  | 'HOLD_STEADY'
  | 'VIEW_OBSTRUCTED'
  | 'EXCELLENT_FRAMING'
  | 'BONUS_COMPOSITION';

/** Stable, exhaustive list of known feedback codes — used by validators/tests. */
export const FEEDBACK_CODES: readonly FeedbackCode[] = [
  'SUBJECT_NOT_VISIBLE',
  'MOVE_CLOSER',
  'MOVE_FARTHER',
  'CENTER_SUBJECT',
  'WRONG_VIEWING_SIDE',
  'TOO_LOW',
  'TOO_HIGH',
  'HOLD_STEADY',
  'VIEW_OBSTRUCTED',
  'EXCELLENT_FRAMING',
  'BONUS_COMPOSITION',
];

export function isKnownFeedbackCode(code: string): code is FeedbackCode {
  return (FEEDBACK_CODES as readonly string[]).includes(code);
}
