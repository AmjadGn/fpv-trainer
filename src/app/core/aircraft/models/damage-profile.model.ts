import type { DroneDamageState } from '../../physics/models/collision.models';

export interface DamageVisualCue {
  state: DroneDamageState;
  description: string;
  hideBladeIndex?: number;
  emissiveFlash?: boolean;
  scuffIntensity: number;
}

export interface DamageProfile {
  id: string;
  version: string;
  /** Visual-only damage progression cues (deterministic). */
  cues: DamageVisualCue[];
  collisionEnergyScale: number;
  /** Ranked modes: non-crash damage remains visual. */
  competitiveVisualOnly: boolean;
}
