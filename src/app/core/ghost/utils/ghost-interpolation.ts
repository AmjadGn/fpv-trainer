import type { FlightReplay, ReplayFrame } from '../../replay/models/replay.model';
import {
  sampleReplayAt,
  type InterpolatedReplaySample,
} from '../../replay/utils/replay-interpolation';
import type { GhostGateSplit } from '../models/ghost.models';

/**
 * Thin wrapper around replay interpolation for ghost playback.
 * Does not mutate stored frames.
 */
export function sampleGhostAt(
  frames: FlightReplay['frames'],
  timeMs: number,
  out?: InterpolatedReplaySample,
): InterpolatedReplaySample {
  return sampleReplayAt(frames, timeMs, out);
}

/**
 * Derive gate split times from recorded frames.
 * Split for gate N is the first timestamp where currentGateIndex > N
 * (i.e. gate N has been completed).
 */
export function deriveGhostGateSplits(
  frames: readonly ReplayFrame[],
  gateCount: number,
): GhostGateSplit[] {
  if (frames.length === 0 || gateCount <= 0) {
    return [];
  }

  const splits: GhostGateSplit[] = [];
  let nextGate = 0;

  for (const frame of frames) {
    if (!Number.isFinite(frame.timestampMs) || !Number.isFinite(frame.currentGateIndex)) {
      continue;
    }
    while (
      nextGate < gateCount &&
      frame.currentGateIndex > nextGate
    ) {
      splits.push({ gateIndex: nextGate, timeMs: frame.timestampMs });
      nextGate += 1;
    }
    if (nextGate >= gateCount) {
      break;
    }
  }

  return splits;
}

/**
 * Look up ghost elapsed time when it completed the given gate index.
 */
export function ghostSplitTimeMs(
  splits: readonly GhostGateSplit[],
  gateIndex: number,
): number | null {
  for (const split of splits) {
    if (split.gateIndex === gateIndex) {
      return Number.isFinite(split.timeMs) ? split.timeMs : null;
    }
  }
  return null;
}
