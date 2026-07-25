import { Injectable, computed, signal } from '@angular/core';

import {
  REPLAY_FORMAT_VERSION,
  REPLAY_MAX_DURATION_MS,
  REPLAY_SAMPLE_HZ,
  REPLAY_STORAGE_KEY,
  REPLAY_STORAGE_MAX_BYTES,
  angularToReplay,
  quatToReplay,
  type FlightReplay,
  type ReplayCollisionEvent,
  type ReplayFrame,
  type ReplayMetadata,
  vec3ToReplay,
} from '../models/replay.model';
import { validateReplay } from '../utils/replay-validation';

export interface ReplayRecordSample {
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
  velocity: { x: number; y: number; z: number };
  angularVelocity: { pitch: number; yaw: number; roll: number };
  throttle: number;
  armed: boolean;
  crashed: boolean;
  currentGateIndex: number;
}

export type ReplayStorageStatus =
  | 'empty'
  | 'memory'
  | 'persisted'
  | 'quota_exceeded'
  | 'corrupt';

/**
 * Records timed-run frames at a fixed sample rate.
 * Does not alter simulation timing.
 */
@Injectable({ providedIn: 'root' })
export class ReplayRecorderService {
  private recording = false;
  private frames: ReplayFrame[] = [];
  private collisionEvents: ReplayCollisionEvent[] = [];
  private sampleAccumulator = 0;
  private elapsedMs = 0;
  private frameIntervalMs = 1000 / REPLAY_SAMPLE_HZ;
  private startedAtIso = '';
  private courseId = '';
  private environmentId = 'alpine-training-valley';
  private environmentVersion = 1;
  private rateProfileId = 'normal';
  private weatherPresetId = 'calm';
  private weatherCategory: 'standard' | 'challenge' = 'standard';
  private windSeed = 0;
  private windParametersSnapshot: ReplayMetadata['windParametersSnapshot'];
  private collisionModelVersion?: string;
  private colliderManifestVersion?: string;
  private droneColliderVersion?: string;
  private physicsEngineVersion?: string;
  private environmentArtVersion?: string;
  private aircraftId?: string;
  private aircraftDefinitionVersion?: string;
  private physicsProfileVersion?: string;
  private colliderVersion?: string;
  private visualVersion?: string;
  private liveryId?: string;
  private cameraProfileId?: string;
  private truncated = false;
  private incomplete: FlightReplay | null = null;

  private latestCompleted: FlightReplay | null = null;
  private readonly hasReplaySignal = signal(false);
  private readonly metadataSignal = signal<ReplayMetadata | null>(null);
  private readonly storageStatusSignal = signal<ReplayStorageStatus>('empty');
  private readonly warningSignal = signal<string | null>(null);

  readonly hasReplay = this.hasReplaySignal.asReadonly();
  readonly latestReplayMetadata = this.metadataSignal.asReadonly();
  readonly storageStatus = this.storageStatusSignal.asReadonly();
  readonly warning = this.warningSignal.asReadonly();
  readonly isRecording = computed(() => this.recording);

  constructor() {
    this.loadFromStorage();
  }

  getLatestReplay(): FlightReplay | null {
    return this.latestCompleted;
  }

  startRecording(options: {
    courseId: string;
    environmentId?: string;
    environmentVersion?: number;
    rateProfileId: string;
    weatherPresetId?: string;
    weatherCategory?: 'standard' | 'challenge';
    windSeed?: number;
    windParametersSnapshot?: ReplayMetadata['windParametersSnapshot'];
    collisionModelVersion?: string;
    colliderManifestVersion?: string;
    droneColliderVersion?: string;
    physicsEngineVersion?: string;
    environmentArtVersion?: string;
    aircraftId?: string;
    aircraftDefinitionVersion?: string;
    physicsProfileVersion?: string;
    colliderVersion?: string;
    visualVersion?: string;
    liveryId?: string;
    cameraProfileId?: string;
  }): void {
    this.recording = true;
    this.frames = [];
    this.collisionEvents = [];
    this.sampleAccumulator = 0;
    this.elapsedMs = 0;
    this.truncated = false;
    this.incomplete = null;
    this.warningSignal.set(null);
    this.courseId = options.courseId;
    this.environmentId = options.environmentId ?? 'alpine-training-valley';
    this.environmentVersion = options.environmentVersion ?? 1;
    this.rateProfileId = options.rateProfileId;
    this.weatherPresetId = options.weatherPresetId ?? 'calm';
    this.weatherCategory = options.weatherCategory ?? 'standard';
    this.windSeed = options.windSeed ?? 0;
    this.collisionModelVersion = options.collisionModelVersion;
    this.colliderManifestVersion = options.colliderManifestVersion;
    this.droneColliderVersion = options.droneColliderVersion;
    this.physicsEngineVersion = options.physicsEngineVersion;
    this.environmentArtVersion = options.environmentArtVersion;
    this.aircraftId = options.aircraftId;
    this.aircraftDefinitionVersion = options.aircraftDefinitionVersion;
    this.physicsProfileVersion = options.physicsProfileVersion;
    this.colliderVersion = options.colliderVersion;
    this.visualVersion = options.visualVersion;
    this.liveryId = options.liveryId;
    this.cameraProfileId = options.cameraProfileId;
    this.windParametersSnapshot = options.windParametersSnapshot
      ? {
          ...options.windParametersSnapshot,
          baseDirection: { ...options.windParametersSnapshot.baseDirection },
        }
      : undefined;
    this.startedAtIso = new Date().toISOString();
    this.frameIntervalMs = 1000 / REPLAY_SAMPLE_HZ;
  }

  pushCollisionEvent(event: ReplayCollisionEvent): void {
    if (!this.recording) {
      return;
    }
    this.collisionEvents.push(event);
    if (this.collisionEvents.length > 200) {
      this.collisionEvents.splice(0, this.collisionEvents.length - 160);
    }
  }

  /**
   * Called from the fixed physics step. Samples at REPLAY_SAMPLE_HZ,
   * not every physics tick.
   */
  pushSample(sample: ReplayRecordSample, deltaSeconds: number): void {
    if (!this.recording) {
      return;
    }

    this.elapsedMs += deltaSeconds * 1000;
    if (this.elapsedMs > REPLAY_MAX_DURATION_MS) {
      this.truncated = true;
      this.warningSignal.set(
        'Replay recording stopped at 5-minute limit.',
      );
      this.stopRecording({ saveCompleted: false });
      return;
    }

    this.sampleAccumulator += deltaSeconds * 1000;
    if (this.frames.length > 0 && this.sampleAccumulator < this.frameIntervalMs) {
      return;
    }
    this.sampleAccumulator = 0;

    this.frames.push({
      timestampMs: this.elapsedMs,
      position: vec3ToReplay(sample.position),
      orientation: quatToReplay(sample.orientation),
      linearVelocity: vec3ToReplay(sample.velocity),
      angularVelocity: angularToReplay(sample.angularVelocity),
      throttle: sample.throttle,
      armed: sample.armed,
      crashed: sample.crashed,
      currentGateIndex: sample.currentGateIndex,
    });
  }

  /**
   * Stop recording. Only persists when saveCompleted is true (valid finish).
   */
  stopRecording(options: {
    saveCompleted: boolean;
    finalTimeMs?: number;
    bestTimeAtCompletion?: number | null;
  }): FlightReplay | null {
    if (!this.recording && this.frames.length === 0) {
      return null;
    }

    this.recording = false;
    const frames = this.frames;
    this.frames = [];

    if (frames.length === 0) {
      return null;
    }

    const durationMs =
      frames[frames.length - 1].timestampMs || this.elapsedMs || this.frameIntervalMs;

    const replay: FlightReplay = {
      metadata: {
        replayVersion: REPLAY_FORMAT_VERSION,
        courseId: this.courseId,
        environmentId: this.environmentId,
        startedAt: this.startedAtIso,
        durationMs,
        completed: options.saveCompleted,
        finalTimeMs: options.finalTimeMs ?? durationMs,
        bestTimeAtCompletion: options.bestTimeAtCompletion ?? null,
        rateProfileId: this.rateProfileId,
        frameIntervalMs: this.frameIntervalMs,
        environmentVersion: this.environmentVersion,
        weatherPresetId: this.weatherPresetId,
        weatherCategory: this.weatherCategory,
        windSeed: this.windSeed,
        ...(this.windParametersSnapshot
          ? { windParametersSnapshot: this.windParametersSnapshot }
          : {}),
        ...(this.collisionModelVersion
          ? { collisionModelVersion: this.collisionModelVersion }
          : {}),
        ...(this.colliderManifestVersion
          ? { colliderManifestVersion: this.colliderManifestVersion }
          : {}),
        ...(this.droneColliderVersion
          ? { droneColliderVersion: this.droneColliderVersion }
          : {}),
        ...(this.physicsEngineVersion
          ? { physicsEngineVersion: this.physicsEngineVersion }
          : {}),
        ...(this.environmentArtVersion
          ? { environmentArtVersion: this.environmentArtVersion }
          : {}),
        ...(this.aircraftId ? { aircraftId: this.aircraftId } : {}),
        ...(this.aircraftDefinitionVersion
          ? { aircraftDefinitionVersion: this.aircraftDefinitionVersion }
          : {}),
        ...(this.physicsProfileVersion
          ? { physicsProfileVersion: this.physicsProfileVersion }
          : {}),
        ...(this.colliderVersion ? { colliderVersion: this.colliderVersion } : {}),
        ...(this.visualVersion ? { visualVersion: this.visualVersion } : {}),
        ...(this.liveryId ? { liveryId: this.liveryId } : {}),
        ...(this.cameraProfileId
          ? { cameraProfileId: this.cameraProfileId }
          : {}),
      },
      frames,
      ...(this.collisionEvents.length > 0
        ? { collisionEvents: this.collisionEvents }
        : {}),
    };

    this.collisionEvents = [];

    if (!options.saveCompleted) {
      this.incomplete = replay;
      return null;
    }

    this.commitCompleted(replay);
    return replay;
  }

  cancelRecording(): void {
    this.stopRecording({ saveCompleted: false });
  }

  clearReplay(): void {
    this.latestCompleted = null;
    this.hasReplaySignal.set(false);
    this.metadataSignal.set(null);
    this.storageStatusSignal.set('empty');
    this.warningSignal.set(null);
    try {
      localStorage.removeItem(REPLAY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  clearWarning(): void {
    this.warningSignal.set(null);
  }

  /** Incomplete buffer for debugging only — not exposed as completed replay. */
  getIncompleteForDebug(): FlightReplay | null {
    return this.incomplete;
  }

  private commitCompleted(replay: FlightReplay): void {
    this.latestCompleted = replay;
    this.hasReplaySignal.set(true);
    this.metadataSignal.set(replay.metadata);

    try {
      const json = JSON.stringify(replay);
      const bytes = estimateUtf16Bytes(json);
      if (bytes > REPLAY_STORAGE_MAX_BYTES) {
        this.storageStatusSignal.set('quota_exceeded');
        this.warningSignal.set(
          'Replay kept in memory only — too large for local storage.',
        );
        return;
      }
      localStorage.setItem(REPLAY_STORAGE_KEY, json);
      this.storageStatusSignal.set('persisted');
    } catch {
      this.storageStatusSignal.set('quota_exceeded');
      this.warningSignal.set(
        'Replay kept in memory only — storage quota exceeded.',
      );
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(REPLAY_STORAGE_KEY);
      if (!raw) {
        this.storageStatusSignal.set('empty');
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const validated = validateReplay(parsed);
      if (!validated.ok || !validated.replay.metadata.completed) {
        localStorage.removeItem(REPLAY_STORAGE_KEY);
        this.storageStatusSignal.set('corrupt');
        return;
      }
      this.latestCompleted = validated.replay;
      this.hasReplaySignal.set(true);
      this.metadataSignal.set(validated.replay.metadata);
      this.storageStatusSignal.set('persisted');
    } catch {
      try {
        localStorage.removeItem(REPLAY_STORAGE_KEY);
      } catch {
        // ignore
      }
      this.storageStatusSignal.set('corrupt');
    }
  }
}

function estimateUtf16Bytes(text: string): number {
  // JS strings are UTF-16; localStorage typically counts similarly.
  return text.length * 2;
}
