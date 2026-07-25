export type RunStatus =
  | 'idle'
  | 'countdown'
  | 'running'
  | 'finished'
  | 'invalid';

export interface RunState {
  status: RunStatus;
  currentGateIndex: number;
  completedGateCount: number;
  elapsedSeconds: number;
  bestTimeSeconds: number | null;
  countdownSeconds: number;
  missedGate: boolean;
  wrongDirection: boolean;
  finishedAt: string | null;
  /** Brief post-countdown GO flash remaining (s). */
  goFlashSeconds: number;
  /** Optional invalidation reason for HUD. */
  invalidReason: string | null;
}

export const INITIAL_RUN_STATE: Readonly<RunState> = {
  status: 'idle',
  currentGateIndex: 0,
  completedGateCount: 0,
  elapsedSeconds: 0,
  bestTimeSeconds: null,
  countdownSeconds: 0,
  missedGate: false,
  wrongDirection: false,
  finishedAt: null,
  goFlashSeconds: 0,
  invalidReason: null,
};

export function formatRunTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--.--';
  }
  const totalMs = Math.round(seconds * 100);
  const mins = Math.floor(totalMs / 6000);
  const secs = Math.floor((totalMs % 6000) / 100);
  const cs = totalMs % 100;
  return `${mins}:${secs.toString().padStart(2, '0')}.${cs
    .toString()
    .padStart(2, '0')}`;
}
