import {
  type FlightReplay,
  type ReplayFrame,
  type ReplayMetadata,
  type ReplayQuat,
  type ReplayVec3,
} from '../models/replay.model';

const SUPPORTED_REPLAY_VERSIONS = new Set([1, 2, 3]);

export type ReplayValidationResult =
  | { ok: true; replay: FlightReplay }
  | { ok: false; reason: string };

export function validateReplay(raw: unknown): ReplayValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'Replay is not an object' };
  }
  const obj = raw as Record<string, unknown>;
  const metaRaw = obj['metadata'];
  const framesRaw = obj['frames'];

  if (!metaRaw || typeof metaRaw !== 'object') {
    return { ok: false, reason: 'Missing metadata' };
  }
  if (!Array.isArray(framesRaw)) {
    return { ok: false, reason: 'Missing frames' };
  }
  if (framesRaw.length === 0) {
    return { ok: false, reason: 'Empty frame list' };
  }

  const meta = metaRaw as Record<string, unknown>;
  const version = meta['replayVersion'];
  if (typeof version !== 'number' || !SUPPORTED_REPLAY_VERSIONS.has(version)) {
    return { ok: false, reason: 'Unsupported replay version' };
  }

  const metadata = validateMetadata(meta);
  if (!metadata.ok) {
    return metadata;
  }

  const frames: ReplayFrame[] = [];
  let prevTs = -1;
  for (let i = 0; i < framesRaw.length; i++) {
    const frameResult = validateFrame(framesRaw[i], i);
    if (!frameResult.ok) {
      return frameResult;
    }
    if (frameResult.frame.timestampMs < prevTs) {
      return { ok: false, reason: `Non-monotonic timestamp at frame ${i}` };
    }
    prevTs = frameResult.frame.timestampMs;
    frames.push(frameResult.frame);
  }

  const durationMs = metadata.metadata.durationMs;
  if (!(durationMs > 0) || !Number.isFinite(durationMs)) {
    return { ok: false, reason: 'Invalid duration' };
  }

  return {
    ok: true,
    replay: {
      metadata: metadata.metadata,
      frames,
    },
  };
}

function validateMetadata(
  meta: Record<string, unknown>,
): { ok: true; metadata: ReplayMetadata } | { ok: false; reason: string } {
  const replayVersion = meta['replayVersion'];
  const courseId = meta['courseId'];
  const environmentId = meta['environmentId'];
  const startedAt = meta['startedAt'];
  const durationMs = meta['durationMs'];
  const completed = meta['completed'];
  const finalTimeMs = meta['finalTimeMs'];
  const rateProfileId = meta['rateProfileId'];
  const frameIntervalMs = meta['frameIntervalMs'];
  const bestTimeAtCompletion = meta['bestTimeAtCompletion'];

  if (typeof replayVersion !== 'number' || !SUPPORTED_REPLAY_VERSIONS.has(replayVersion)) {
    return { ok: false, reason: 'Unsupported replay version' };
  }
  if (typeof courseId !== 'string' || !courseId) {
    return { ok: false, reason: 'Invalid courseId' };
  }
  if (typeof environmentId !== 'string') {
    return { ok: false, reason: 'Invalid environmentId' };
  }
  if (typeof startedAt !== 'string') {
    return { ok: false, reason: 'Invalid startedAt' };
  }
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, reason: 'Invalid durationMs' };
  }
  if (typeof completed !== 'boolean') {
    return { ok: false, reason: 'Invalid completed flag' };
  }
  if (typeof finalTimeMs !== 'number' || !Number.isFinite(finalTimeMs)) {
    return { ok: false, reason: 'Invalid finalTimeMs' };
  }
  if (typeof rateProfileId !== 'string') {
    return { ok: false, reason: 'Invalid rateProfileId' };
  }
  if (
    typeof frameIntervalMs !== 'number' ||
    !Number.isFinite(frameIntervalMs) ||
    frameIntervalMs <= 0
  ) {
    return { ok: false, reason: 'Invalid frameIntervalMs' };
  }
  if (
    bestTimeAtCompletion !== null &&
    (typeof bestTimeAtCompletion !== 'number' ||
      !Number.isFinite(bestTimeAtCompletion))
  ) {
    return { ok: false, reason: 'Invalid bestTimeAtCompletion' };
  }

  const weather = normalizeWeatherFields(meta, replayVersion);
  if (!weather.ok) {
    return weather;
  }

  return {
    ok: true,
    metadata: {
      replayVersion,
      courseId,
      environmentId,
      startedAt,
      durationMs,
      completed,
      finalTimeMs,
      bestTimeAtCompletion:
        typeof bestTimeAtCompletion === 'number' ? bestTimeAtCompletion : null,
      rateProfileId,
      frameIntervalMs,
      ...weather.fields,
    },
  };
}

function normalizeWeatherFields(
  meta: Record<string, unknown>,
  replayVersion: number,
):
  | {
      ok: true;
      fields: Pick<
        ReplayMetadata,
        | 'environmentVersion'
        | 'weatherPresetId'
        | 'weatherCategory'
        | 'windSeed'
        | 'windParametersSnapshot'
      >;
    }
  | { ok: false; reason: string } {
  // v1 (and any missing weather): fill calm/standard defaults for playback.
  if (replayVersion === 1) {
    return {
      ok: true,
      fields: {
        weatherPresetId: 'calm',
        weatherCategory: 'standard',
        environmentVersion: 1,
        windSeed: 0,
      },
    };
  }

  const environmentVersion = meta['environmentVersion'];
  const weatherPresetId = meta['weatherPresetId'];
  const weatherCategory = meta['weatherCategory'];
  const windSeed = meta['windSeed'];
  const windSnap = meta['windParametersSnapshot'];

  if (
    environmentVersion !== undefined &&
    (typeof environmentVersion !== 'number' ||
      !Number.isFinite(environmentVersion))
  ) {
    return { ok: false, reason: 'Invalid environmentVersion' };
  }
  if (weatherPresetId !== undefined && typeof weatherPresetId !== 'string') {
    return { ok: false, reason: 'Invalid weatherPresetId' };
  }
  if (
    weatherCategory !== undefined &&
    weatherCategory !== 'standard' &&
    weatherCategory !== 'challenge'
  ) {
    return { ok: false, reason: 'Invalid weatherCategory' };
  }
  if (
    windSeed !== undefined &&
    (typeof windSeed !== 'number' || !Number.isFinite(windSeed))
  ) {
    return { ok: false, reason: 'Invalid windSeed' };
  }

  let windParametersSnapshot: ReplayMetadata['windParametersSnapshot'];
  if (windSnap !== undefined) {
    const parsed = validateWindSnapshot(windSnap);
    if (!parsed.ok) {
      return parsed;
    }
    windParametersSnapshot = parsed.snapshot;
  }

  return {
    ok: true,
    fields: {
      environmentVersion:
        typeof environmentVersion === 'number' ? environmentVersion : 1,
      weatherPresetId:
        typeof weatherPresetId === 'string' ? weatherPresetId : 'calm',
      weatherCategory:
        weatherCategory === 'challenge' ? 'challenge' : 'standard',
      windSeed: typeof windSeed === 'number' ? windSeed : 0,
      ...(windParametersSnapshot ? { windParametersSnapshot } : {}),
    },
  };
}

function validateWindSnapshot(
  raw: unknown,
):
  | { ok: true; snapshot: NonNullable<ReplayMetadata['windParametersSnapshot']> }
  | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'Invalid windParametersSnapshot' };
  }
  const o = raw as Record<string, unknown>;
  const enabled = o['enabled'];
  const baseSpeed = o['baseSpeed'];
  const gustStrength = o['gustStrength'];
  const gustFrequency = o['gustFrequency'];
  const turbulence = o['turbulence'];
  const verticalDraftStrength = o['verticalDraftStrength'];
  const seed = o['seed'];
  const dir = o['baseDirection'];

  if (typeof enabled !== 'boolean') {
    return { ok: false, reason: 'Invalid windParametersSnapshot.enabled' };
  }
  if (
    typeof baseSpeed !== 'number' ||
    typeof gustStrength !== 'number' ||
    typeof gustFrequency !== 'number' ||
    typeof turbulence !== 'number' ||
    typeof verticalDraftStrength !== 'number' ||
    typeof seed !== 'number' ||
    !Number.isFinite(baseSpeed) ||
    !Number.isFinite(gustStrength) ||
    !Number.isFinite(gustFrequency) ||
    !Number.isFinite(turbulence) ||
    !Number.isFinite(verticalDraftStrength) ||
    !Number.isFinite(seed)
  ) {
    return { ok: false, reason: 'Invalid windParametersSnapshot scalars' };
  }
  if (!dir || typeof dir !== 'object') {
    return { ok: false, reason: 'Invalid windParametersSnapshot.baseDirection' };
  }
  const d = dir as Record<string, unknown>;
  if (
    typeof d['x'] !== 'number' ||
    typeof d['y'] !== 'number' ||
    typeof d['z'] !== 'number' ||
    !Number.isFinite(d['x']) ||
    !Number.isFinite(d['y']) ||
    !Number.isFinite(d['z'])
  ) {
    return { ok: false, reason: 'Invalid windParametersSnapshot.baseDirection' };
  }

  return {
    ok: true,
    snapshot: {
      enabled,
      baseDirection: { x: d['x'], y: d['y'], z: d['z'] },
      baseSpeed,
      gustStrength,
      gustFrequency,
      turbulence,
      verticalDraftStrength,
      seed,
    },
  };
}

function validateFrame(
  raw: unknown,
  index: number,
): { ok: true; frame: ReplayFrame } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: `Frame ${index} is not an object` };
  }
  const f = raw as Record<string, unknown>;
  const timestampMs = f['timestampMs'];
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs) || timestampMs < 0) {
    return { ok: false, reason: `Invalid timestamp at frame ${index}` };
  }

  const position = asVec3(f['position']);
  const linearVelocity = asVec3(f['linearVelocity']);
  const angularVelocity = asVec3(f['angularVelocity']);
  const orientation = asQuat(f['orientation']);
  if (!position || !linearVelocity || !angularVelocity || !orientation) {
    return { ok: false, reason: `Invalid vectors at frame ${index}` };
  }

  const throttle = f['throttle'];
  const armed = f['armed'];
  const crashed = f['crashed'];
  const currentGateIndex = f['currentGateIndex'];

  if (typeof throttle !== 'number' || !Number.isFinite(throttle)) {
    return { ok: false, reason: `Invalid throttle at frame ${index}` };
  }
  if (typeof armed !== 'boolean' || typeof crashed !== 'boolean') {
    return { ok: false, reason: `Invalid flags at frame ${index}` };
  }
  if (typeof currentGateIndex !== 'number' || !Number.isFinite(currentGateIndex)) {
    return { ok: false, reason: `Invalid gate index at frame ${index}` };
  }

  return {
    ok: true,
    frame: {
      timestampMs,
      position,
      orientation,
      linearVelocity,
      angularVelocity,
      throttle,
      armed,
      crashed,
      currentGateIndex: Math.max(0, Math.floor(currentGateIndex)),
    },
  };
}

function asVec3(raw: unknown): ReplayVec3 | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const x = o['x'];
  const y = o['y'];
  const z = o['z'];
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof z !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return null;
  }
  return { x, y, z };
}

function asQuat(raw: unknown): ReplayQuat | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const x = o['x'];
  const y = o['y'];
  const z = o['z'];
  const w = o['w'];
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof z !== 'number' ||
    typeof w !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    !Number.isFinite(w)
  ) {
    return null;
  }
  const len = Math.hypot(x, y, z, w);
  if (!(len > 0.1) || !Number.isFinite(len)) {
    return null;
  }
  // Normalize mildly invalid unit quats.
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}
