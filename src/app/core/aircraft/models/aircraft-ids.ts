/**
 * Centralized commercial aircraft identity.
 * Rename display names here — never hardcode them across the app.
 */
export const AIRCRAFT_IDS = {
  aeroGuard2: 'aeroguard-2',
  velocityX: 'velocity-x',
  nanoScout: 'nano-scout',
  apexR5: 'apex-r5',
  fluxF5: 'flux-f5',
  horizonL7: 'horizon-l7',
} as const;

export type AircraftId = (typeof AIRCRAFT_IDS)[keyof typeof AIRCRAFT_IDS];

export const DEFAULT_AIRCRAFT_ID: AircraftId = AIRCRAFT_IDS.aeroGuard2;

/** Legacy single-drone replays / ghosts map to this craft. */
export const LEGACY_FALLBACK_AIRCRAFT_ID: AircraftId = AIRCRAFT_IDS.fluxF5;

export const AIRCRAFT_DISPLAY_NAMES: Record<AircraftId, string> = {
  [AIRCRAFT_IDS.aeroGuard2]: 'AeroGuard 2',
  [AIRCRAFT_IDS.velocityX]: 'Velocity X',
  [AIRCRAFT_IDS.nanoScout]: 'Nano Scout',
  [AIRCRAFT_IDS.apexR5]: 'Apex R5',
  [AIRCRAFT_IDS.fluxF5]: 'Flux F5',
  [AIRCRAFT_IDS.horizonL7]: 'Horizon L7',
};

export const FICTIONAL_MANUFACTURERS = {
  skywardDynamics: 'Skyward Dynamics',
  vectorForge: 'Vector Forge',
  microNest: 'MicroNest Labs',
  apexRacing: 'Apex Racing Systems',
  fluxCraft: 'FluxCraft',
  horizonAero: 'Horizon Aero',
} as const;
