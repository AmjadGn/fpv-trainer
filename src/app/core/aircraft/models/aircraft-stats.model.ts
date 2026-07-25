/** Player-facing normalized stats derived from physics profiles (0–100). */
export interface AircraftNormalizedStats {
  speed: number;
  acceleration: number;
  agility: number;
  stability: number;
  windResistance: number;
  glide: number;
  collisionProtection: number;
  beginnerFriendliness: number;
}

export const AIRCRAFT_STATS_DISCLAIMER =
  'Flight behavior is a simulator approximation based on aircraft class, public specifications, and internal tuning.';
