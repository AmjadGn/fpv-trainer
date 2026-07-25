import type {
  GhostAheadState,
  GhostComparisonSnapshot,
  GhostGateSplit,
} from '../models/ghost.models';
import { ghostSplitTimeMs } from './ghost-interpolation';

export interface GhostComparisonInput {
  playerElapsedMs: number;
  playerGateIndex: number;
  playerCompletedGates: number;
  ghostGateIndex: number;
  ghostCompletedGates: number;
  ghostSplits: readonly GhostGateSplit[];
  /** Previous smoothed delta for exponential smoothing. */
  previousSmoothedDelta: number | null;
  distanceMeters: number | null;
  /** Exact split from last completed player gate (preferred). */
  lastExactSplitDeltaSeconds: number | null;
  lastExactSplitGateIndex: number;
  useApproximateLive: boolean;
  smoothingAlpha?: number;
}

function finiteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function aheadFromDelta(deltaSeconds: number | null): GhostAheadState {
  if (deltaSeconds === null) {
    return 'unknown';
  }
  if (Math.abs(deltaSeconds) < 0.005) {
    return 'tied';
  }
  return deltaSeconds < 0 ? 'ahead' : 'behind';
}

/**
 * Compute comparison snapshot.
 * Prefer exact gate-split delta; optional approximate live delta between gates.
 */
export function computeGhostComparison(
  input: GhostComparisonInput,
): GhostComparisonSnapshot {
  const exact = finiteOrNull(input.lastExactSplitDeltaSeconds);
  let live: number | null = null;

  if (input.useApproximateLive) {
    // Rough estimate: compare elapsed times at the same completed-gate count
    // using ghost split for the next gate the player is chasing.
    const chaseGate = Math.max(0, input.playerCompletedGates);
    const ghostAtGate = ghostSplitTimeMs(input.ghostSplits, chaseGate);
    if (ghostAtGate !== null && input.playerElapsedMs >= 0) {
      // How far along toward this gate the ghost was at player's current time.
      // Positive delta => player slower (behind).
      live = (input.playerElapsedMs - ghostAtGate) / 1000;
      if (!Number.isFinite(live)) {
        live = null;
      }
    }
  }

  const displayBase = exact ?? (input.useApproximateLive ? live : null);
  const alpha = input.smoothingAlpha ?? 0.22;
  let smoothed = finiteOrNull(input.previousSmoothedDelta);
  if (displayBase !== null) {
    smoothed =
      smoothed === null
        ? displayBase
        : smoothed + (displayBase - smoothed) * alpha;
    if (!Number.isFinite(smoothed)) {
      smoothed = displayBase;
    }
  }

  const progressDelta =
    input.playerCompletedGates - input.ghostCompletedGates +
    // fractional-ish nudge from gate index when counts equal
    (input.playerGateIndex - input.ghostGateIndex) * 0.01;

  return {
    aheadState: aheadFromDelta(exact ?? smoothed),
    splitDeltaSeconds: exact,
    liveDeltaSeconds: live,
    distanceMeters: finiteOrNull(input.distanceMeters),
    progressDelta: Number.isFinite(progressDelta) ? progressDelta : 0,
    splitGateIndex: input.lastExactSplitGateIndex,
    smoothedDeltaSeconds: smoothed,
  };
}

/**
 * Exact split difference when player completes a gate.
 * Returns playerTime - ghostTime in seconds (negative = ahead).
 */
export function computeExactGateSplitDeltaSeconds(
  playerElapsedMs: number,
  ghostSplits: readonly GhostGateSplit[],
  completedGateIndex: number,
): number | null {
  const ghostMs = ghostSplitTimeMs(ghostSplits, completedGateIndex);
  if (ghostMs === null || !Number.isFinite(playerElapsedMs)) {
    return null;
  }
  const delta = (playerElapsedMs - ghostMs) / 1000;
  return Number.isFinite(delta) ? delta : null;
}

export function formatGhostDeltaSeconds(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) {
    return '—';
  }
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const abs = Math.abs(delta);
  return `${sign}${abs.toFixed(2)} s`;
}
