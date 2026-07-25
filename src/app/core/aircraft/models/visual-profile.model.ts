export type AircraftSilhouette =
  | 'protected-cinewhoop'
  | 'hybrid-speed'
  | 'micro-protected'
  | 'racing-x'
  | 'freestyle-x'
  | 'long-range';

export type AircraftLiveryId = string;

export interface AircraftLivery {
  id: AircraftLiveryId;
  displayName: string;
  primaryColor: number;
  accentColor: number;
  secondaryColor: number;
  canopyColor: number;
  ledFront: number;
  ledRear: number;
}

export interface PropellerVisualConfig {
  diameterMeters: number;
  bladeCount: number;
  idleRpmPresentation: number;
  maxVisualRpm: number;
  /** +1 / −1 per motor; length 4. */
  spinDirections: ReadonlyArray<number>;
  blurThresholdRpm: number;
  blurOpacity: number;
  spoolResponse: number;
  propWashVisualStrength: number;
}

export interface VisualProfile {
  id: string;
  version: string;
  silhouette: AircraftSilhouette;
  scale: number;
  defaultLiveryId: AircraftLiveryId;
  supportedLiveries: AircraftLivery[];
  propeller: PropellerVisualConfig;
  /** Procedural geometry key — no external GLB required. */
  proceduralModelKey: AircraftSilhouette;
  lodProfile: 'full' | 'chase' | 'fpv';
  previewAsset: 'procedural';
  hangarAsset: 'procedural';
  flightAsset: 'procedural';
}
