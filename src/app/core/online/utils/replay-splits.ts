import type { FlightReplay } from '../../replay/models/replay.model';

/**
 * Derive monotonic gate splits from a completed replay's gate index progression.
 * Falls back to evenly spaced estimates when the replay lacks gate transitions.
 */
export function splitsFromReplay(
  replay: FlightReplay | null,
  gateCount: number,
  durationMs: number,
): Array<{ gateIndex: number; timeMs: number }> {
  if (gateCount <= 0) {
    return [];
  }

  const rebuilt: Array<{ gateIndex: number; timeMs: number }> = [];
  if (replay?.frames?.length) {
    let seen = 0;
    for (const frame of replay.frames) {
      while (seen < gateCount && frame.currentGateIndex > seen) {
        rebuilt.push({
          gateIndex: seen,
          timeMs: Math.max(0, Math.round(frame.timestampMs)),
        });
        seen += 1;
      }
      if (seen >= gateCount) {
        break;
      }
    }
  }

  if (rebuilt.length === gateCount) {
    rebuilt[gateCount - 1] = {
      gateIndex: gateCount - 1,
      timeMs: Math.max(rebuilt[gateCount - 1].timeMs, Math.round(durationMs)),
    };
    return rebuilt;
  }

  const splits: Array<{ gateIndex: number; timeMs: number }> = [];
  for (let i = 0; i < gateCount; i++) {
    const prior = rebuilt[i];
    splits.push({
      gateIndex: i,
      timeMs:
        prior?.timeMs ??
        Math.round(((i + 1) / gateCount) * durationMs),
    });
  }
  splits[gateCount - 1] = {
    gateIndex: gateCount - 1,
    timeMs: Math.round(durationMs),
  };
  return splits;
}
