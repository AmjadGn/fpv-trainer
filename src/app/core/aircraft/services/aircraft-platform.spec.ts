import { describe, expect, it, beforeEach } from 'vitest';

import { AIRCRAFT_IDS } from '../models/aircraft-ids';
import {
  AIRCRAFT_PREFS_STORAGE_KEY,
  AircraftPersistenceService,
} from '../services/aircraft-persistence.service';
import { isAircraftAllowed, leaderboardKeyForPolicy } from '../services/aircraft-policy.util';
import { resolveReplayAircraft } from '../adapters/replay-aircraft.adapter';
import type { ReplayMetadata } from '../../replay/models/replay.model';

describe('Aircraft persistence', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem(AIRCRAFT_PREFS_STORAGE_KEY);
    } catch {
      /* jsdom */
    }
  });

  it('falls back safely for invalid selection', () => {
    const svc = new AircraftPersistenceService();
    const prefs = svc.load();
    expect(prefs.selectedAircraftId).toBe(AIRCRAFT_IDS.aeroGuard2);
  });

  it('persists favorites and recent aircraft', () => {
    const svc = new AircraftPersistenceService();
    svc.toggleFavorite(AIRCRAFT_IDS.apexR5);
    svc.pushRecent(AIRCRAFT_IDS.velocityX);
    expect(svc.favorites().has(AIRCRAFT_IDS.apexR5)).toBe(true);
    expect(svc.recent()[0]).toBe(AIRCRAFT_IDS.velocityX);

    const again = new AircraftPersistenceService();
    expect(again.favorites().has(AIRCRAFT_IDS.apexR5)).toBe(true);
  });
});

describe('Competitive aircraft policy', () => {
  it('enforces fixed and class rules', () => {
    expect(
      isAircraftAllowed(
        { kind: 'fixedAircraft', fixedAircraftId: AIRCRAFT_IDS.apexR5 },
        AIRCRAFT_IDS.apexR5,
      ),
    ).toBe(true);
    expect(
      isAircraftAllowed(
        { kind: 'fixedAircraft', fixedAircraftId: AIRCRAFT_IDS.apexR5 },
        AIRCRAFT_IDS.fluxF5,
      ),
    ).toBe(false);
    expect(
      isAircraftAllowed(
        { kind: 'aircraftClass', allowedClasses: ['racing-5inch'] },
        AIRCRAFT_IDS.apexR5,
        'racing-5inch',
      ),
    ).toBe(true);
  });

  it('separates leaderboards per aircraft when configured', () => {
    expect(
      leaderboardKeyForPolicy(
        { kind: 'separateLeaderboardPerAircraft' },
        'course-a',
        AIRCRAFT_IDS.nanoScout,
      ),
    ).toBe(`course-a::${AIRCRAFT_IDS.nanoScout}`);
  });
});

describe('Replay aircraft adapter', () => {
  it('falls back for legacy replays without aircraftId', () => {
    const meta = { rateProfileId: 'normal' } as ReplayMetadata;
    const resolved = resolveReplayAircraft(meta);
    expect(resolved.legacyFallback).toBe(true);
    expect(resolved.aircraftId).toBe(AIRCRAFT_IDS.fluxF5);
  });
});
