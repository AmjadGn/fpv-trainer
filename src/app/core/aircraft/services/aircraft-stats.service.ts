import { Injectable } from '@angular/core';

import type { AircraftDefinition } from '../models/aircraft-definition.model';
import type { AircraftNormalizedStats } from '../models/aircraft-stats.model';
import { AIRCRAFT_STATS_DISCLAIMER } from '../models/aircraft-stats.model';
import type { FlightProfile } from '../models/flight-profile.model';

/**
 * Derives player-facing 0–100 stats from actual physics profiles.
 * Never hand-author UI stats that disagree with FlightProfile.
 */
@Injectable({ providedIn: 'root' })
export class AircraftStatsService {
  readonly disclaimer = AIRCRAFT_STATS_DISCLAIMER;

  derive(def: AircraftDefinition): AircraftNormalizedStats {
    return this.fromFlightProfile(def.flightProfile, def);
  }

  fromFlightProfile(
    profile: FlightProfile,
    def?: AircraftDefinition,
  ): AircraftNormalizedStats {
    const twr =
      profile.maxThrustNewtons / Math.max(0.01, profile.massKg * 9.81);
    const angular =
      (profile.maxRollRate + profile.maxPitchRate + profile.maxYawRate) / 3;
    const accel =
      (profile.rollAcceleration + profile.pitchAcceleration) / 2;

    return {
      speed: clamp01(profile.maxVelocity / 48) * 100,
      acceleration: clamp01(twr / 5.5) * 100,
      agility: clamp01(angular / 9.5) * 100,
      stability: clamp01(profile.stabilizationStrength) * 100,
      windResistance: clamp01(1.5 - profile.windSensitivity) * 100,
      glide: clamp01(profile.glideEfficiency) * 100,
      collisionProtection: clamp01(
        1.6 - (def?.damageProfile.collisionEnergyScale ?? profile.collisionEnergyMultiplier),
      ) * 100,
      beginnerFriendliness: clamp01(
        (profile.recoveryStrength * 0.45 +
          profile.landingTolerance * 0.25 +
          profile.stabilizationStrength * 0.3) /
          1.2,
      ) * 100,
    };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.min(1, Math.max(0, n));
}
