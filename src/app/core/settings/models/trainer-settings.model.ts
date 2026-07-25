export type EnvironmentQuality = 'low' | 'medium' | 'high';
export type TimeOfDay = 'morning' | 'midday' | 'sunset';
export type CameraEffectsIntensity = 'off' | 'low' | 'medium' | 'high';
export type ReplayCameraMode = 'fpv' | 'chase' | 'orbit';
export type ReplayPlaybackSpeed = 0.25 | 0.5 | 1 | 2;

export interface TrainerEnvironmentSettings {
  selectedEnvironmentId: string;
  quality: EnvironmentQuality;
  timeOfDay: TimeOfDay;
  vegetation: boolean;
  shadows: boolean;
  fog: boolean;
}

export interface TrainerWeatherSettings {
  selectedFreeFlightWeatherPreset: string;
  windPhysicsEnabled: boolean;
  weatherVisualsEnabled: boolean;
  precipitationEnabled: boolean;
  windHudEnabled: boolean;
  windOnMinimapEnabled: boolean;
  environmentAmbienceVolume: number;
  weatherAudioVolume: number;
  reduceWeatherMotion: boolean;
  reducePrecipitationDensity: boolean;
}

export interface TrainerCameraEffectsSettings {
  cameraEffectsEnabled: boolean;
  cameraEffectsIntensity: CameraEffectsIntensity;
  speedVibrationEnabled: boolean;
  throttleVibrationEnabled: boolean;
  impactShakeEnabled: boolean;
  dynamicFovEnabled: boolean;
  /** Extra FOV degrees at high speed (clamped 0–8). */
  dynamicFovStrength: number;
  /** FPV camera pitch-up relative to drone (degrees). */
  fpvCameraAngleDeg: number;
  /** Base FPV lens FOV (degrees). */
  fpvLensFov: number;
  /** Subtle barrel distortion amount 0–1 (visual only). */
  lensDistortion: number;
  /** Show propeller tips in FPV (when body mostly hidden). */
  propellerVisibilityInFpv: boolean;
  /** Optional analog noise during crash. */
  crashFeedNoiseEnabled: boolean;
  /** Optional vignette. */
  vignetteEnabled: boolean;
}

export interface TrainerAudioSettings {
  audioEnabled: boolean;
  masterVolume: number;
  motorVolume: number;
  effectsVolume: number;
  uiVolume: number;
}

export interface TrainerVisualEffectsSettings {
  propellerBlurEnabled: boolean;
  groundDustEnabled: boolean;
  crashParticlesEnabled: boolean;
  gatePulseEnabled: boolean;
}

export interface TrainerReplaySettings {
  replayFlightTrailEnabled: boolean;
  replayDefaultCamera: ReplayCameraMode;
  replayDefaultSpeed: ReplayPlaybackSpeed;
}

export type GhostComparisonModeSetting =
  | 'gateSplits'
  | 'approximateLive'
  | 'both';

export interface TrainerGhostSettings {
  ghostEnabled: boolean;
  ghostTrailEnabled: boolean;
  /** 0–1 opacity for ghost drone materials. */
  ghostOpacity: number;
  ghostCountdownPreview: boolean;
  ghostComparisonMode: GhostComparisonModeSetting;
}

export interface TrainerTrainingSettings {
  trainingGuidanceEnabled: boolean;
  trainingTipsEnabled: boolean;
  /** 0–1 opacity for training target visuals. */
  trainingTargetOpacity: number;
  autoShowTrainingBriefing: boolean;
}

export interface TrainerProgressionSettings {
  achievementNotificationsEnabled: boolean;
  xpNotificationsEnabled: boolean;
}

export interface TrainerSettings {
  version: number;
  environment: TrainerEnvironmentSettings;
  /** When true, request fullscreen after Start Flight / Start Run (user gesture). */
  autoFullscreenOnFlight: boolean;
  weather: TrainerWeatherSettings;
  camera: TrainerCameraEffectsSettings;
  audio: TrainerAudioSettings;
  visualEffects: TrainerVisualEffectsSettings;
  replay: TrainerReplaySettings;
  ghost: TrainerGhostSettings;
  training: TrainerTrainingSettings;
  progression: TrainerProgressionSettings;
}

export const TRAINER_SETTINGS_VERSION = 4;
export const TRAINER_SETTINGS_STORAGE_KEY = 'fpv-trainer.settings.v1';

export const DEFAULT_TRAINER_ENVIRONMENT_SETTINGS: TrainerEnvironmentSettings =
  {
    selectedEnvironmentId: 'alpine-training-valley',
    quality: 'medium',
    timeOfDay: 'midday',
    vegetation: true,
    shadows: true,
    fog: true,
  };

export const DEFAULT_WEATHER_SETTINGS: TrainerWeatherSettings = {
  selectedFreeFlightWeatherPreset: 'calm',
  windPhysicsEnabled: true,
  weatherVisualsEnabled: true,
  precipitationEnabled: true,
  windHudEnabled: false,
  windOnMinimapEnabled: false,
  environmentAmbienceVolume: 40,
  weatherAudioVolume: 50,
  reduceWeatherMotion: false,
  reducePrecipitationDensity: false,
};

export const DEFAULT_CAMERA_EFFECTS_SETTINGS: TrainerCameraEffectsSettings = {
  cameraEffectsEnabled: true,
  cameraEffectsIntensity: 'low',
  speedVibrationEnabled: true,
  throttleVibrationEnabled: true,
  impactShakeEnabled: true,
  dynamicFovEnabled: true,
  dynamicFovStrength: 5,
  fpvCameraAngleDeg: 8,
  fpvLensFov: 75,
  lensDistortion: 0.15,
  propellerVisibilityInFpv: false,
  crashFeedNoiseEnabled: true,
  vignetteEnabled: true,
};

export const DEFAULT_AUDIO_SETTINGS: TrainerAudioSettings = {
  audioEnabled: true,
  masterVolume: 70,
  motorVolume: 65,
  effectsVolume: 80,
  uiVolume: 60,
};

export const DEFAULT_VISUAL_EFFECTS_SETTINGS: TrainerVisualEffectsSettings = {
  propellerBlurEnabled: true,
  groundDustEnabled: true,
  crashParticlesEnabled: true,
  gatePulseEnabled: true,
};

export const DEFAULT_REPLAY_SETTINGS: TrainerReplaySettings = {
  replayFlightTrailEnabled: true,
  replayDefaultCamera: 'fpv',
  replayDefaultSpeed: 1,
};

export const DEFAULT_GHOST_SETTINGS: TrainerGhostSettings = {
  ghostEnabled: true,
  ghostTrailEnabled: true,
  ghostOpacity: 0.4,
  ghostCountdownPreview: true,
  ghostComparisonMode: 'gateSplits',
};

export const DEFAULT_TRAINING_SETTINGS: TrainerTrainingSettings = {
  trainingGuidanceEnabled: true,
  trainingTipsEnabled: true,
  trainingTargetOpacity: 0.35,
  autoShowTrainingBriefing: true,
};

export const DEFAULT_PROGRESSION_SETTINGS: TrainerProgressionSettings = {
  achievementNotificationsEnabled: true,
  xpNotificationsEnabled: true,
};

export const DEFAULT_TRAINER_SETTINGS: TrainerSettings = {
  version: TRAINER_SETTINGS_VERSION,
  environment: { ...DEFAULT_TRAINER_ENVIRONMENT_SETTINGS },
  autoFullscreenOnFlight: false,
  weather: { ...DEFAULT_WEATHER_SETTINGS },
  camera: { ...DEFAULT_CAMERA_EFFECTS_SETTINGS },
  audio: { ...DEFAULT_AUDIO_SETTINGS },
  visualEffects: { ...DEFAULT_VISUAL_EFFECTS_SETTINGS },
  replay: { ...DEFAULT_REPLAY_SETTINGS },
  ghost: { ...DEFAULT_GHOST_SETTINGS },
  training: { ...DEFAULT_TRAINING_SETTINGS },
  progression: { ...DEFAULT_PROGRESSION_SETTINGS },
};

const QUALITIES: readonly EnvironmentQuality[] = ['low', 'medium', 'high'];
const TIMES: readonly TimeOfDay[] = ['morning', 'midday', 'sunset'];
const INTENSITIES: readonly CameraEffectsIntensity[] = [
  'off',
  'low',
  'medium',
  'high',
];
const REPLAY_CAMERAS: readonly ReplayCameraMode[] = ['fpv', 'chase', 'orbit'];
const REPLAY_SPEEDS: readonly ReplayPlaybackSpeed[] = [0.25, 0.5, 1, 2];
const GHOST_COMPARISON_MODES: readonly GhostComparisonModeSetting[] = [
  'gateSplits',
  'approximateLive',
  'both',
];

export function isEnvironmentQuality(
  value: unknown,
): value is EnvironmentQuality {
  return (
    typeof value === 'string' && (QUALITIES as readonly string[]).includes(value)
  );
}

export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return (
    typeof value === 'string' && (TIMES as readonly string[]).includes(value)
  );
}

export function isCameraEffectsIntensity(
  value: unknown,
): value is CameraEffectsIntensity {
  return (
    typeof value === 'string' &&
    (INTENSITIES as readonly string[]).includes(value)
  );
}

export function isReplayCameraMode(value: unknown): value is ReplayCameraMode {
  return (
    typeof value === 'string' &&
    (REPLAY_CAMERAS as readonly string[]).includes(value)
  );
}

export function isReplayPlaybackSpeed(
  value: unknown,
): value is ReplayPlaybackSpeed {
  return (
    typeof value === 'number' &&
    (REPLAY_SPEEDS as readonly number[]).includes(value)
  );
}

export function isGhostComparisonMode(
  value: unknown,
): value is GhostComparisonModeSetting {
  return (
    typeof value === 'string' &&
    (GHOST_COMPARISON_MODES as readonly string[]).includes(value)
  );
}

/** Clamp unit opacity 0–1. */
export function clampUnitOpacity(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

/** Clamp volume 0–100. */
export function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampFovStrength(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(8, Math.max(0, value));
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function readBoolean(
  value: unknown,
  fallback: boolean,
): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeCamera(
  raw: Record<string, unknown> | undefined,
): TrainerCameraEffectsSettings {
  const src = raw ?? {};
  return {
    cameraEffectsEnabled: readBoolean(
      src['cameraEffectsEnabled'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.cameraEffectsEnabled,
    ),
    cameraEffectsIntensity: isCameraEffectsIntensity(
      src['cameraEffectsIntensity'],
    )
      ? src['cameraEffectsIntensity']
      : DEFAULT_CAMERA_EFFECTS_SETTINGS.cameraEffectsIntensity,
    speedVibrationEnabled: readBoolean(
      src['speedVibrationEnabled'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.speedVibrationEnabled,
    ),
    throttleVibrationEnabled: readBoolean(
      src['throttleVibrationEnabled'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.throttleVibrationEnabled,
    ),
    impactShakeEnabled: readBoolean(
      src['impactShakeEnabled'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.impactShakeEnabled,
    ),
    dynamicFovEnabled: readBoolean(
      src['dynamicFovEnabled'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.dynamicFovEnabled,
    ),
    dynamicFovStrength: clampFovStrength(
      src['dynamicFovStrength'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.dynamicFovStrength,
    ),
    fpvCameraAngleDeg: clampNumber(
      src['fpvCameraAngleDeg'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.fpvCameraAngleDeg,
      0,
      45,
    ),
    fpvLensFov: clampNumber(
      src['fpvLensFov'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.fpvLensFov,
      50,
      120,
    ),
    lensDistortion: clampNumber(
      src['lensDistortion'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.lensDistortion,
      0,
      1,
    ),
    propellerVisibilityInFpv: readBoolean(
      src['propellerVisibilityInFpv'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.propellerVisibilityInFpv,
    ),
    crashFeedNoiseEnabled: readBoolean(
      src['crashFeedNoiseEnabled'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.crashFeedNoiseEnabled,
    ),
    vignetteEnabled: readBoolean(
      src['vignetteEnabled'],
      DEFAULT_CAMERA_EFFECTS_SETTINGS.vignetteEnabled,
    ),
  };
}

function normalizeAudio(
  raw: Record<string, unknown> | undefined,
): TrainerAudioSettings {
  const src = raw ?? {};
  return {
    audioEnabled: readBoolean(
      src['audioEnabled'],
      DEFAULT_AUDIO_SETTINGS.audioEnabled,
    ),
    masterVolume: clampVolume(
      src['masterVolume'],
      DEFAULT_AUDIO_SETTINGS.masterVolume,
    ),
    motorVolume: clampVolume(
      src['motorVolume'],
      DEFAULT_AUDIO_SETTINGS.motorVolume,
    ),
    effectsVolume: clampVolume(
      src['effectsVolume'],
      DEFAULT_AUDIO_SETTINGS.effectsVolume,
    ),
    uiVolume: clampVolume(src['uiVolume'], DEFAULT_AUDIO_SETTINGS.uiVolume),
  };
}

function normalizeVisualEffects(
  raw: Record<string, unknown> | undefined,
): TrainerVisualEffectsSettings {
  const src = raw ?? {};
  return {
    propellerBlurEnabled: readBoolean(
      src['propellerBlurEnabled'],
      DEFAULT_VISUAL_EFFECTS_SETTINGS.propellerBlurEnabled,
    ),
    groundDustEnabled: readBoolean(
      src['groundDustEnabled'],
      DEFAULT_VISUAL_EFFECTS_SETTINGS.groundDustEnabled,
    ),
    crashParticlesEnabled: readBoolean(
      src['crashParticlesEnabled'],
      DEFAULT_VISUAL_EFFECTS_SETTINGS.crashParticlesEnabled,
    ),
    gatePulseEnabled: readBoolean(
      src['gatePulseEnabled'],
      DEFAULT_VISUAL_EFFECTS_SETTINGS.gatePulseEnabled,
    ),
  };
}

function normalizeReplay(
  raw: Record<string, unknown> | undefined,
): TrainerReplaySettings {
  const src = raw ?? {};
  return {
    replayFlightTrailEnabled: readBoolean(
      src['replayFlightTrailEnabled'],
      DEFAULT_REPLAY_SETTINGS.replayFlightTrailEnabled,
    ),
    replayDefaultCamera: isReplayCameraMode(src['replayDefaultCamera'])
      ? src['replayDefaultCamera']
      : DEFAULT_REPLAY_SETTINGS.replayDefaultCamera,
    replayDefaultSpeed: isReplayPlaybackSpeed(src['replayDefaultSpeed'])
      ? src['replayDefaultSpeed']
      : DEFAULT_REPLAY_SETTINGS.replayDefaultSpeed,
  };
}

function normalizeGhost(
  raw: Record<string, unknown> | undefined,
): TrainerGhostSettings {
  const src = raw ?? {};
  return {
    ghostEnabled: readBoolean(
      src['ghostEnabled'],
      DEFAULT_GHOST_SETTINGS.ghostEnabled,
    ),
    ghostTrailEnabled: readBoolean(
      src['ghostTrailEnabled'],
      DEFAULT_GHOST_SETTINGS.ghostTrailEnabled,
    ),
    ghostOpacity: clampUnitOpacity(
      src['ghostOpacity'],
      DEFAULT_GHOST_SETTINGS.ghostOpacity,
    ),
    ghostCountdownPreview: readBoolean(
      src['ghostCountdownPreview'],
      DEFAULT_GHOST_SETTINGS.ghostCountdownPreview,
    ),
    ghostComparisonMode: isGhostComparisonMode(src['ghostComparisonMode'])
      ? src['ghostComparisonMode']
      : DEFAULT_GHOST_SETTINGS.ghostComparisonMode,
  };
}

function normalizeTraining(
  raw: Record<string, unknown> | undefined,
): TrainerTrainingSettings {
  const src = raw ?? {};
  return {
    trainingGuidanceEnabled: readBoolean(
      src['trainingGuidanceEnabled'],
      DEFAULT_TRAINING_SETTINGS.trainingGuidanceEnabled,
    ),
    trainingTipsEnabled: readBoolean(
      src['trainingTipsEnabled'],
      DEFAULT_TRAINING_SETTINGS.trainingTipsEnabled,
    ),
    trainingTargetOpacity: clampUnitOpacity(
      src['trainingTargetOpacity'],
      DEFAULT_TRAINING_SETTINGS.trainingTargetOpacity,
    ),
    autoShowTrainingBriefing: readBoolean(
      src['autoShowTrainingBriefing'],
      DEFAULT_TRAINING_SETTINGS.autoShowTrainingBriefing,
    ),
  };
}

function normalizeProgression(
  raw: Record<string, unknown> | undefined,
): TrainerProgressionSettings {
  const src = raw ?? {};
  return {
    achievementNotificationsEnabled: readBoolean(
      src['achievementNotificationsEnabled'],
      DEFAULT_PROGRESSION_SETTINGS.achievementNotificationsEnabled,
    ),
    xpNotificationsEnabled: readBoolean(
      src['xpNotificationsEnabled'],
      DEFAULT_PROGRESSION_SETTINGS.xpNotificationsEnabled,
    ),
  };
}

function readEnvironmentId(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return DEFAULT_TRAINER_ENVIRONMENT_SETTINGS.selectedEnvironmentId;
}

function readWeatherPresetId(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return DEFAULT_WEATHER_SETTINGS.selectedFreeFlightWeatherPreset;
}

function normalizeWeather(
  raw: Record<string, unknown> | undefined,
): TrainerWeatherSettings {
  const src = raw ?? {};
  return {
    selectedFreeFlightWeatherPreset: readWeatherPresetId(
      src['selectedFreeFlightWeatherPreset'],
    ),
    windPhysicsEnabled: readBoolean(
      src['windPhysicsEnabled'],
      DEFAULT_WEATHER_SETTINGS.windPhysicsEnabled,
    ),
    weatherVisualsEnabled: readBoolean(
      src['weatherVisualsEnabled'],
      DEFAULT_WEATHER_SETTINGS.weatherVisualsEnabled,
    ),
    precipitationEnabled: readBoolean(
      src['precipitationEnabled'],
      DEFAULT_WEATHER_SETTINGS.precipitationEnabled,
    ),
    windHudEnabled: readBoolean(
      src['windHudEnabled'],
      DEFAULT_WEATHER_SETTINGS.windHudEnabled,
    ),
    windOnMinimapEnabled: readBoolean(
      src['windOnMinimapEnabled'],
      DEFAULT_WEATHER_SETTINGS.windOnMinimapEnabled,
    ),
    environmentAmbienceVolume: clampVolume(
      src['environmentAmbienceVolume'],
      DEFAULT_WEATHER_SETTINGS.environmentAmbienceVolume,
    ),
    weatherAudioVolume: clampVolume(
      src['weatherAudioVolume'],
      DEFAULT_WEATHER_SETTINGS.weatherAudioVolume,
    ),
    reduceWeatherMotion: readBoolean(
      src['reduceWeatherMotion'],
      DEFAULT_WEATHER_SETTINGS.reduceWeatherMotion,
    ),
    reducePrecipitationDensity: readBoolean(
      src['reducePrecipitationDensity'],
      DEFAULT_WEATHER_SETTINGS.reducePrecipitationDensity,
    ),
  };
}

/** Validate / migrate unknown saved JSON into a safe TrainerSettings object. */
export function normalizeTrainerSettings(raw: unknown): TrainerSettings {
  if (!raw || typeof raw !== 'object') {
    return cloneDefaults();
  }

  const obj = raw as Record<string, unknown>;
  const envRaw =
    obj['environment'] && typeof obj['environment'] === 'object'
      ? (obj['environment'] as Record<string, unknown>)
      : {};

  const quality = isEnvironmentQuality(envRaw['quality'])
    ? envRaw['quality']
    : DEFAULT_TRAINER_ENVIRONMENT_SETTINGS.quality;
  const timeOfDay = isTimeOfDay(envRaw['timeOfDay'])
    ? envRaw['timeOfDay']
    : DEFAULT_TRAINER_ENVIRONMENT_SETTINGS.timeOfDay;

  const weatherRaw =
    obj['weather'] && typeof obj['weather'] === 'object'
      ? (obj['weather'] as Record<string, unknown>)
      : undefined;
  const cameraRaw =
    obj['camera'] && typeof obj['camera'] === 'object'
      ? (obj['camera'] as Record<string, unknown>)
      : undefined;
  const audioRaw =
    obj['audio'] && typeof obj['audio'] === 'object'
      ? (obj['audio'] as Record<string, unknown>)
      : undefined;
  const visualRaw =
    obj['visualEffects'] && typeof obj['visualEffects'] === 'object'
      ? (obj['visualEffects'] as Record<string, unknown>)
      : undefined;
  const replayRaw =
    obj['replay'] && typeof obj['replay'] === 'object'
      ? (obj['replay'] as Record<string, unknown>)
      : undefined;
  const ghostRaw =
    obj['ghost'] && typeof obj['ghost'] === 'object'
      ? (obj['ghost'] as Record<string, unknown>)
      : undefined;
  const trainingRaw =
    obj['training'] && typeof obj['training'] === 'object'
      ? (obj['training'] as Record<string, unknown>)
      : undefined;
  const progressionRaw =
    obj['progression'] && typeof obj['progression'] === 'object'
      ? (obj['progression'] as Record<string, unknown>)
      : undefined;

  return {
    version: TRAINER_SETTINGS_VERSION,
    environment: {
      selectedEnvironmentId: readEnvironmentId(envRaw['selectedEnvironmentId']),
      quality,
      timeOfDay,
      vegetation:
        typeof envRaw['vegetation'] === 'boolean'
          ? envRaw['vegetation']
          : DEFAULT_TRAINER_ENVIRONMENT_SETTINGS.vegetation,
      shadows:
        typeof envRaw['shadows'] === 'boolean'
          ? envRaw['shadows']
          : DEFAULT_TRAINER_ENVIRONMENT_SETTINGS.shadows,
      fog:
        typeof envRaw['fog'] === 'boolean'
          ? envRaw['fog']
          : DEFAULT_TRAINER_ENVIRONMENT_SETTINGS.fog,
    },
    autoFullscreenOnFlight:
      typeof obj['autoFullscreenOnFlight'] === 'boolean'
        ? obj['autoFullscreenOnFlight']
        : DEFAULT_TRAINER_SETTINGS.autoFullscreenOnFlight,
    weather: normalizeWeather(weatherRaw),
    camera: normalizeCamera(cameraRaw),
    audio: normalizeAudio(audioRaw),
    visualEffects: normalizeVisualEffects(visualRaw),
    replay: normalizeReplay(replayRaw),
    ghost: normalizeGhost(ghostRaw),
    training: normalizeTraining(trainingRaw),
    progression: normalizeProgression(progressionRaw),
  };
}

/** Defaults for polish-only categories (camera / audio / visual / replay / ghost / training / progression). */
export function clonePolishDefaults(): Pick<
  TrainerSettings,
  | 'camera'
  | 'audio'
  | 'visualEffects'
  | 'replay'
  | 'ghost'
  | 'training'
  | 'progression'
> {
  return {
    camera: { ...DEFAULT_CAMERA_EFFECTS_SETTINGS },
    audio: { ...DEFAULT_AUDIO_SETTINGS },
    visualEffects: { ...DEFAULT_VISUAL_EFFECTS_SETTINGS },
    replay: { ...DEFAULT_REPLAY_SETTINGS },
    ghost: { ...DEFAULT_GHOST_SETTINGS },
    training: { ...DEFAULT_TRAINING_SETTINGS },
    progression: { ...DEFAULT_PROGRESSION_SETTINGS },
  };
}

function cloneDefaults(): TrainerSettings {
  return {
    version: TRAINER_SETTINGS_VERSION,
    environment: { ...DEFAULT_TRAINER_ENVIRONMENT_SETTINGS },
    autoFullscreenOnFlight: DEFAULT_TRAINER_SETTINGS.autoFullscreenOnFlight,
    weather: { ...DEFAULT_WEATHER_SETTINGS },
    ...clonePolishDefaults(),
  };
}
