import type { AudioProfile } from '../models/audio-profile.model';
import type { CameraProfile } from '../models/camera-profile.model';
import type { DamageProfile } from '../models/damage-profile.model';
import type { VisualProfile } from '../models/visual-profile.model';

const chaseBase = {
  targetOffset: { x: 0, y: 0.4, z: 0 },
  followLag: 6,
  rotationLag: 5,
  collisionAvoidanceRadius: 0.4,
};

export const CAMERA_AEROGUARD_2: CameraProfile = {
  id: 'cam-aeroguard-2',
  version: '1.0.0',
  fpv: {
    localPosition: { x: 0, y: 0.08, z: -0.12 },
    cameraAngleDeg: 6,
    angleRangeDeg: { min: 0, max: 25 },
    defaultFov: 78,
    minFov: 70,
    maxFov: 95,
    vibrationResponse: 0.35,
    impactShakeMultiplier: 0.7,
    cameraNoise: 0.08,
    propellerVisibility: true,
    bodyVisibility: true,
  },
  chase: {
    ...chaseBase,
    localOffset: { x: 0, y: 1.8, z: 4.2 },
    dynamicDistance: 0.8,
    dynamicFov: 3,
  },
  replay: {
    orbitDistance: 3.5,
    cinematicDistance: 5,
    trackingStiffness: 4,
    crashFraming: 1.2,
    hangarFraming: 2.2,
  },
};

export const CAMERA_VELOCITY_X: CameraProfile = {
  id: 'cam-velocity-x',
  version: '1.0.0',
  fpv: {
    localPosition: { x: 0, y: 0.1, z: -0.2 },
    cameraAngleDeg: 18,
    angleRangeDeg: { min: 5, max: 40 },
    defaultFov: 82,
    minFov: 70,
    maxFov: 105,
    vibrationResponse: 0.45,
    impactShakeMultiplier: 1.2,
    cameraNoise: 0.1,
    propellerVisibility: false,
    bodyVisibility: false,
  },
  chase: {
    ...chaseBase,
    localOffset: { x: 0, y: 2.6, z: 7 },
    dynamicDistance: 1.6,
    dynamicFov: 8,
  },
  replay: {
    orbitDistance: 5.5,
    cinematicDistance: 8,
    trackingStiffness: 3.5,
    crashFraming: 1.5,
    hangarFraming: 3.2,
  },
};

export const CAMERA_NANO_SCOUT: CameraProfile = {
  id: 'cam-nano-scout',
  version: '1.0.0',
  fpv: {
    localPosition: { x: 0, y: 0.05, z: -0.07 },
    cameraAngleDeg: 10,
    angleRangeDeg: { min: 0, max: 30 },
    defaultFov: 80,
    minFov: 70,
    maxFov: 100,
    vibrationResponse: 0.85,
    impactShakeMultiplier: 0.6,
    cameraNoise: 0.18,
    propellerVisibility: true,
    bodyVisibility: true,
  },
  chase: {
    ...chaseBase,
    localOffset: { x: 0, y: 1.2, z: 2.8 },
    dynamicDistance: 0.5,
    dynamicFov: 4,
  },
  replay: {
    orbitDistance: 2.2,
    cinematicDistance: 3.2,
    trackingStiffness: 5,
    crashFraming: 1,
    hangarFraming: 1.6,
  },
};

export const CAMERA_APEX_R5: CameraProfile = {
  id: 'cam-apex-r5',
  version: '1.0.0',
  fpv: {
    localPosition: { x: 0, y: 0.06, z: -0.1 },
    cameraAngleDeg: 25,
    angleRangeDeg: { min: 10, max: 45 },
    defaultFov: 85,
    minFov: 75,
    maxFov: 110,
    vibrationResponse: 0.55,
    impactShakeMultiplier: 1.1,
    cameraNoise: 0.12,
    propellerVisibility: false,
    bodyVisibility: false,
  },
  chase: {
    ...chaseBase,
    localOffset: { x: 0, y: 2.0, z: 5.0 },
    dynamicDistance: 1.2,
    dynamicFov: 7,
  },
  replay: {
    orbitDistance: 4,
    cinematicDistance: 6,
    trackingStiffness: 5.5,
    crashFraming: 1.3,
    hangarFraming: 2.4,
  },
};

export const CAMERA_FLUX_F5: CameraProfile = {
  id: 'cam-flux-f5',
  version: '1.0.0',
  fpv: {
    localPosition: { x: 0, y: 0.12, z: -0.18 },
    cameraAngleDeg: 15,
    angleRangeDeg: { min: 5, max: 40 },
    defaultFov: 75,
    minFov: 65,
    maxFov: 100,
    vibrationResponse: 0.5,
    impactShakeMultiplier: 1,
    cameraNoise: 0.1,
    propellerVisibility: false,
    bodyVisibility: true,
  },
  chase: {
    ...chaseBase,
    localOffset: { x: 0, y: 2.2, z: 5.5 },
    dynamicDistance: 1,
    dynamicFov: 5,
  },
  replay: {
    orbitDistance: 4.2,
    cinematicDistance: 6.2,
    trackingStiffness: 4.5,
    crashFraming: 1.25,
    hangarFraming: 2.5,
  },
};

export const CAMERA_HORIZON_L7: CameraProfile = {
  id: 'cam-horizon-l7',
  version: '1.0.0',
  fpv: {
    localPosition: { x: 0, y: 0.1, z: -0.16 },
    cameraAngleDeg: 12,
    angleRangeDeg: { min: 0, max: 30 },
    defaultFov: 72,
    minFov: 60,
    maxFov: 90,
    vibrationResponse: 0.25,
    impactShakeMultiplier: 1.15,
    cameraNoise: 0.05,
    propellerVisibility: true,
    bodyVisibility: true,
  },
  chase: {
    ...chaseBase,
    localOffset: { x: 0, y: 3.0, z: 8 },
    dynamicDistance: 1.4,
    dynamicFov: 4,
  },
  replay: {
    orbitDistance: 6,
    cinematicDistance: 9,
    trackingStiffness: 3,
    crashFraming: 1.6,
    hangarFraming: 3.6,
  },
};

export const AUDIO_AEROGUARD_2: AudioProfile = {
  id: 'aud-aeroguard-2',
  version: '1.0.0',
  idleFrequencyHz: 70,
  maxFrequencyHz: 240,
  harmonicRatio: 1.85,
  filterBaseHz: 480,
  filterThrottleSpanHz: 900,
  baseGain: 0.05,
  demandGain: 0.14,
  resonanceQ: 1.1,
  noiseGain: 0.1,
  windLayerStrength: 0.35,
  enclosedResonance: 0.85,
  crashGain: 0.02,
  crashFrequencyHz: 48,
  startupPitchBend: 0.12,
  disarmFadeSeconds: 0.2,
};

export const AUDIO_VELOCITY_X: AudioProfile = {
  id: 'aud-velocity-x',
  version: '1.0.0',
  idleFrequencyHz: 62,
  maxFrequencyHz: 210,
  harmonicRatio: 2.0,
  filterBaseHz: 420,
  filterThrottleSpanHz: 1100,
  baseGain: 0.055,
  demandGain: 0.18,
  resonanceQ: 0.85,
  noiseGain: 0.14,
  windLayerStrength: 0.9,
  enclosedResonance: 0.4,
  crashGain: 0.025,
  crashFrequencyHz: 42,
  startupPitchBend: 0.08,
  disarmFadeSeconds: 0.25,
};

export const AUDIO_NANO_SCOUT: AudioProfile = {
  id: 'aud-nano-scout',
  version: '1.0.0',
  idleFrequencyHz: 110,
  maxFrequencyHz: 380,
  harmonicRatio: 2.2,
  filterBaseHz: 800,
  filterThrottleSpanHz: 1600,
  baseGain: 0.035,
  demandGain: 0.12,
  resonanceQ: 0.7,
  noiseGain: 0.08,
  windLayerStrength: 0.55,
  enclosedResonance: 0.3,
  crashGain: 0.015,
  crashFrequencyHz: 70,
  startupPitchBend: 0.2,
  disarmFadeSeconds: 0.12,
};

export const AUDIO_APEX_R5: AudioProfile = {
  id: 'aud-apex-r5',
  version: '1.0.0',
  idleFrequencyHz: 95,
  maxFrequencyHz: 420,
  harmonicRatio: 2.4,
  filterBaseHz: 700,
  filterThrottleSpanHz: 1800,
  baseGain: 0.04,
  demandGain: 0.17,
  resonanceQ: 0.65,
  noiseGain: 0.11,
  windLayerStrength: 0.7,
  enclosedResonance: 0.15,
  crashGain: 0.02,
  crashFrequencyHz: 55,
  startupPitchBend: 0.18,
  disarmFadeSeconds: 0.1,
};

export const AUDIO_FLUX_F5: AudioProfile = {
  id: 'aud-flux-f5',
  version: '1.0.0',
  idleFrequencyHz: 85,
  maxFrequencyHz: 320,
  harmonicRatio: 2.02,
  filterBaseHz: 600,
  filterThrottleSpanHz: 1400,
  baseGain: 0.045,
  demandGain: 0.16,
  resonanceQ: 0.7,
  noiseGain: 0.12,
  windLayerStrength: 0.55,
  enclosedResonance: 0.25,
  crashGain: 0.02,
  crashFrequencyHz: 55,
  startupPitchBend: 0.15,
  disarmFadeSeconds: 0.15,
};

export const AUDIO_HORIZON_L7: AudioProfile = {
  id: 'aud-horizon-l7',
  version: '1.0.0',
  idleFrequencyHz: 55,
  maxFrequencyHz: 190,
  harmonicRatio: 1.75,
  filterBaseHz: 360,
  filterThrottleSpanHz: 900,
  baseGain: 0.05,
  demandGain: 0.15,
  resonanceQ: 0.9,
  noiseGain: 0.13,
  windLayerStrength: 0.65,
  enclosedResonance: 0.2,
  crashGain: 0.022,
  crashFrequencyHz: 38,
  startupPitchBend: 0.06,
  disarmFadeSeconds: 0.3,
};

function damageCues(
  scratched: string,
  damaged: string,
  critical: string,
  crashed: string,
): DamageProfile['cues'] {
  return [
    { state: 'pristine', description: 'No visible wear', scuffIntensity: 0 },
    { state: 'scratched', description: scratched, scuffIntensity: 0.25 },
    { state: 'damaged', description: damaged, scuffIntensity: 0.55, hideBladeIndex: 0 },
    { state: 'critical', description: critical, scuffIntensity: 0.8, hideBladeIndex: 1 },
    { state: 'crashed', description: crashed, scuffIntensity: 1, hideBladeIndex: 0, emissiveFlash: true },
  ];
}

export const DAMAGE_AEROGUARD_2: DamageProfile = {
  id: 'dmg-aeroguard-2',
  version: '1.0.0',
  competitiveVisualOnly: true,
  collisionEnergyScale: 0.75,
  cues: damageCues(
    'Scratched prop rings',
    'Damaged protective shell',
    'Severely cracked ducts',
    'Crashed — shell compromised',
  ),
};

export const DAMAGE_VELOCITY_X: DamageProfile = {
  id: 'dmg-velocity-x',
  version: '1.0.0',
  competitiveVisualOnly: true,
  collisionEnergyScale: 1.25,
  cues: damageCues(
    'Scratched canopy finish',
    'Cracked canopy / arm panel',
    'Structural arm panel failure',
    'High-energy crash damage',
  ),
};

export const DAMAGE_NANO_SCOUT: DamageProfile = {
  id: 'dmg-nano-scout',
  version: '1.0.0',
  competitiveVisualOnly: true,
  collisionEnergyScale: 0.55,
  cues: damageCues(
    'Light body scuffing',
    'Bent-looking prop visual',
    'Multiple scuffs and bent props',
    'Micro airframe crumpled',
  ),
};

export const DAMAGE_APEX_R5: DamageProfile = {
  id: 'dmg-apex-r5',
  version: '1.0.0',
  competitiveVisualOnly: true,
  collisionEnergyScale: 1.4,
  cues: damageCues(
    'Racing-frame scratches',
    'Arm damage visible',
    'Exposed frame arm failure',
    'Race frame destroyed',
  ),
};

export const DAMAGE_FLUX_F5: DamageProfile = {
  id: 'dmg-flux-f5',
  version: '1.0.0',
  competitiveVisualOnly: true,
  collisionEnergyScale: 1,
  cues: damageCues(
    'Camera cage scuffs',
    'Damaged camera cage / strap wear',
    'Cage and strap failure',
    'Freestyle frame crashed',
  ),
};

export const DAMAGE_HORIZON_L7: DamageProfile = {
  id: 'dmg-horizon-l7',
  version: '1.0.0',
  competitiveVisualOnly: true,
  collisionEnergyScale: 1.35,
  cues: damageCues(
    'Arm and antenna scuffs',
    'Arm / antenna / large-prop damage',
    'Long-arm structural damage',
    'Long-range airframe crashed',
  ),
};

const spinStd = [1, -1, -1, 1] as const;

export const VISUAL_AEROGUARD_2: VisualProfile = {
  id: 'vis-aeroguard-2',
  version: '1.0.0',
  silhouette: 'protected-cinewhoop',
  scale: 1,
  defaultLiveryId: 'ag2-teal',
  supportedLiveries: [
    {
      id: 'ag2-teal',
      displayName: 'Harbor Teal',
      primaryColor: 0x1a2a30,
      accentColor: 0x2ec4b6,
      secondaryColor: 0x243840,
      canopyColor: 0x0e1618,
      ledFront: 0xf2f6fa,
      ledRear: 0xe04545,
    },
    {
      id: 'ag2-slate',
      displayName: 'Slate',
      primaryColor: 0x1c2228,
      accentColor: 0x7a8a9a,
      secondaryColor: 0x2a343c,
      canopyColor: 0x101418,
      ledFront: 0xf2f6fa,
      ledRear: 0xe04545,
    },
  ],
  propeller: {
    diameterMeters: 0.12,
    bladeCount: 3,
    idleRpmPresentation: 1200,
    maxVisualRpm: 18000,
    spinDirections: spinStd,
    blurThresholdRpm: 6000,
    blurOpacity: 0.45,
    spoolResponse: 8,
    propWashVisualStrength: 0.6,
  },
  proceduralModelKey: 'protected-cinewhoop',
  lodProfile: 'full',
  previewAsset: 'procedural',
  hangarAsset: 'procedural',
  flightAsset: 'procedural',
};

export const VISUAL_VELOCITY_X: VisualProfile = {
  id: 'vis-velocity-x',
  version: '1.0.0',
  silhouette: 'hybrid-speed',
  scale: 1.35,
  defaultLiveryId: 'vx-ember',
  supportedLiveries: [
    {
      id: 'vx-ember',
      displayName: 'Ember',
      primaryColor: 0x1a1816,
      accentColor: 0xff7a3d,
      secondaryColor: 0x2c2620,
      canopyColor: 0x0c0a08,
      ledFront: 0xffe8d0,
      ledRear: 0xff4d4d,
    },
  ],
  propeller: {
    diameterMeters: 0.165,
    bladeCount: 3,
    idleRpmPresentation: 900,
    maxVisualRpm: 14000,
    spinDirections: spinStd,
    blurThresholdRpm: 5000,
    blurOpacity: 0.5,
    spoolResponse: 6,
    propWashVisualStrength: 0.9,
  },
  proceduralModelKey: 'hybrid-speed',
  lodProfile: 'full',
  previewAsset: 'procedural',
  hangarAsset: 'procedural',
  flightAsset: 'procedural',
};

export const VISUAL_NANO_SCOUT: VisualProfile = {
  id: 'vis-nano-scout',
  version: '1.0.0',
  silhouette: 'micro-protected',
  scale: 0.55,
  defaultLiveryId: 'ns-mint',
  supportedLiveries: [
    {
      id: 'ns-mint',
      displayName: 'Mint',
      primaryColor: 0x1a2824,
      accentColor: 0x5dffb0,
      secondaryColor: 0x243830,
      canopyColor: 0x0c1412,
      ledFront: 0xf0fff8,
      ledRear: 0xff6b6b,
    },
  ],
  propeller: {
    diameterMeters: 0.075,
    bladeCount: 3,
    idleRpmPresentation: 1600,
    maxVisualRpm: 22000,
    spinDirections: spinStd,
    blurThresholdRpm: 7000,
    blurOpacity: 0.4,
    spoolResponse: 12,
    propWashVisualStrength: 0.35,
  },
  proceduralModelKey: 'micro-protected',
  lodProfile: 'full',
  previewAsset: 'procedural',
  hangarAsset: 'procedural',
  flightAsset: 'procedural',
};

export const VISUAL_APEX_R5: VisualProfile = {
  id: 'vis-apex-r5',
  version: '1.0.0',
  silhouette: 'racing-x',
  scale: 0.95,
  defaultLiveryId: 'ar5-volt',
  supportedLiveries: [
    {
      id: 'ar5-volt',
      displayName: 'Volt',
      primaryColor: 0x101418,
      accentColor: 0xc8ff3d,
      secondaryColor: 0x1c2428,
      canopyColor: 0x080c10,
      ledFront: 0xf5ffe0,
      ledRear: 0xff3355,
    },
  ],
  propeller: {
    diameterMeters: 0.127,
    bladeCount: 3,
    idleRpmPresentation: 1400,
    maxVisualRpm: 28000,
    spinDirections: spinStd,
    blurThresholdRpm: 8000,
    blurOpacity: 0.55,
    spoolResponse: 14,
    propWashVisualStrength: 0.7,
  },
  proceduralModelKey: 'racing-x',
  lodProfile: 'full',
  previewAsset: 'procedural',
  hangarAsset: 'procedural',
  flightAsset: 'procedural',
};

export const VISUAL_FLUX_F5: VisualProfile = {
  id: 'vis-flux-f5',
  version: '1.0.0',
  silhouette: 'freestyle-x',
  scale: 1,
  defaultLiveryId: 'ff5-carbon',
  supportedLiveries: [
    {
      id: 'ff5-carbon',
      displayName: 'Carbon',
      primaryColor: 0x141820,
      accentColor: 0x5eb3f0,
      secondaryColor: 0x1a222c,
      canopyColor: 0x0a0e14,
      ledFront: 0xf2f6fa,
      ledRear: 0xe04545,
    },
  ],
  propeller: {
    diameterMeters: 0.13,
    bladeCount: 3,
    idleRpmPresentation: 1200,
    maxVisualRpm: 22000,
    spinDirections: spinStd,
    blurThresholdRpm: 6500,
    blurOpacity: 0.5,
    spoolResponse: 10,
    propWashVisualStrength: 0.65,
  },
  proceduralModelKey: 'freestyle-x',
  lodProfile: 'full',
  previewAsset: 'procedural',
  hangarAsset: 'procedural',
  flightAsset: 'procedural',
};

export const VISUAL_HORIZON_L7: VisualProfile = {
  id: 'vis-horizon-l7',
  version: '1.0.0',
  silhouette: 'long-range',
  scale: 1.55,
  defaultLiveryId: 'hl7-glacier',
  supportedLiveries: [
    {
      id: 'hl7-glacier',
      displayName: 'Glacier',
      primaryColor: 0x161c22,
      accentColor: 0x7ec8ff,
      secondaryColor: 0x222a32,
      canopyColor: 0x0a1016,
      ledFront: 0xe8f4ff,
      ledRear: 0xff5566,
    },
  ],
  propeller: {
    diameterMeters: 0.178,
    bladeCount: 3,
    idleRpmPresentation: 800,
    maxVisualRpm: 12000,
    spinDirections: spinStd,
    blurThresholdRpm: 4500,
    blurOpacity: 0.48,
    spoolResponse: 5,
    propWashVisualStrength: 1,
  },
  proceduralModelKey: 'long-range',
  lodProfile: 'full',
  previewAsset: 'procedural',
  hangarAsset: 'procedural',
  flightAsset: 'procedural',
};
