import type { FlightReplay } from '../../replay/models/replay.model';
import { splitsFromReplay } from './replay-splits';

describe('splitsFromReplay', () => {
  it('derives splits when currentGateIndex advances', () => {
    const replay = {
      metadata: {} as FlightReplay['metadata'],
      frames: [
        { timestampMs: 0, currentGateIndex: 0 },
        { timestampMs: 1000, currentGateIndex: 1 },
        { timestampMs: 2000, currentGateIndex: 2 },
        { timestampMs: 3000, currentGateIndex: 3 },
      ],
    } as FlightReplay;

    expect(splitsFromReplay(replay, 3, 3000)).toEqual([
      { gateIndex: 0, timeMs: 1000 },
      { gateIndex: 1, timeMs: 2000 },
      { gateIndex: 2, timeMs: 3000 },
    ]);
  });

  it('falls back to even spacing without frames', () => {
    expect(splitsFromReplay(null, 2, 1000)).toEqual([
      { gateIndex: 0, timeMs: 500 },
      { gateIndex: 1, timeMs: 1000 },
    ]);
  });
});
