import { Injectable, signal, untracked } from '@angular/core';

import type { FlightReplay } from '../../replay/models/replay.model';
import { validateReplay } from '../../replay/utils/replay-validation';
import type { WeatherRecordCategory } from '../../weather/models/weather.models';
import {
  GHOST_RECORD_VERSION,
  GHOST_STORAGE_MAX_BYTES,
  ghostStorageKey,
  type CourseGhostRecord,
  type GhostMetadata,
  type GhostStorageStatus,
} from '../models/ghost.models';

export type GhostSaveResult =
  | { saved: true; record: CourseGhostRecord; reason: 'first' | 'improved' }
  | {
      saved: false;
      reason:
        | 'slower'
        | 'invalid'
        | 'incomplete'
        | 'course_mismatch'
        | 'quota'
        | 'error';
      warning?: string;
      record?: CourseGhostRecord | null;
    };

/**
 * Persists best-run ghosts per course, separate from latest-replay storage.
 */
@Injectable({ providedIn: 'root' })
export class GhostStorageService {
  private readonly memory = new Map<string, CourseGhostRecord>();
  private readonly statusSignal = signal<GhostStorageStatus>('empty');
  private readonly warningSignal = signal<string | null>(null);

  readonly storageStatus = this.statusSignal.asReadonly();
  readonly warning = this.warningSignal.asReadonly();

  getGhost(
    courseId: string,
    weatherCategory: WeatherRecordCategory = 'standard',
  ): CourseGhostRecord | null {
    if (!courseId) {
      return null;
    }
    const key = ghostStorageKey(courseId, weatherCategory);
    const cached = this.memory.get(key);
    if (cached) {
      return cached;
    }
    return this.loadFromStorage(courseId, weatherCategory);
  }

  hasGhost(
    courseId: string,
    weatherCategory: WeatherRecordCategory = 'standard',
  ): boolean {
    return this.getGhost(courseId, weatherCategory) !== null;
  }

  getGhostMetadata(
    courseId: string,
    weatherCategory: WeatherRecordCategory = 'standard',
  ): GhostMetadata | null {
    const ghost = this.getGhost(courseId, weatherCategory);
    if (!ghost) {
      return null;
    }
    return {
      courseId: ghost.courseId,
      courseVersion: ghost.courseVersion,
      environmentId: ghost.environmentId,
      finalTimeMs: ghost.finalTimeMs,
      rateProfileId: ghost.rateProfileId,
      createdAt: ghost.createdAt,
      frameCount: ghost.replay.frames.length,
    };
  }

  /**
   * Save replay as best ghost when it is the first valid run or faster than existing.
   */
  saveGhostIfBest(
    courseId: string,
    replay: FlightReplay,
    options: {
      courseVersion: number;
      weatherCategory?: WeatherRecordCategory;
    },
  ): GhostSaveResult {
    const weatherCategory = options.weatherCategory ?? 'standard';
    const validated = validateReplay(replay);
    if (!validated.ok) {
      return { saved: false, reason: 'invalid', warning: validated.reason };
    }
    const flight = validated.replay;
    if (!flight.metadata.completed) {
      return { saved: false, reason: 'incomplete' };
    }
    if (flight.metadata.courseId !== courseId) {
      return { saved: false, reason: 'course_mismatch' };
    }
    if (
      !(flight.metadata.finalTimeMs > 0) ||
      !Number.isFinite(flight.metadata.finalTimeMs)
    ) {
      return { saved: false, reason: 'invalid', warning: 'Invalid final time' };
    }

    const existing = this.getGhost(courseId, weatherCategory);
    if (existing && existing.finalTimeMs <= flight.metadata.finalTimeMs) {
      return { saved: false, reason: 'slower', record: existing };
    }

    const record: CourseGhostRecord = {
      version: GHOST_RECORD_VERSION,
      courseId,
      courseVersion: options.courseVersion,
      environmentId: flight.metadata.environmentId,
      finalTimeMs: flight.metadata.finalTimeMs,
      replay: flight,
      rateProfileId: flight.metadata.rateProfileId,
      createdAt: new Date().toISOString(),
      environmentVersion: flight.metadata.environmentVersion,
      weatherCategory:
        flight.metadata.weatherCategory ?? weatherCategory,
      weatherPresetId: flight.metadata.weatherPresetId,
    };

    const key = ghostStorageKey(courseId, weatherCategory);
    this.memory.set(key, record);
    const persist = this.persist(courseId, record, weatherCategory);
    if (!persist.ok) {
      this.statusSignal.set('quota_exceeded');
      this.warningSignal.set(
        persist.warning ??
          'Ghost saved for this session only — storage is full.',
      );
      return {
        saved: true,
        record,
        reason: existing ? 'improved' : 'first',
      };
    }

    this.statusSignal.set('persisted');
    this.warningSignal.set(null);
    return {
      saved: true,
      record,
      reason: existing ? 'improved' : 'first',
    };
  }

  deleteGhost(
    courseId: string,
    weatherCategory: WeatherRecordCategory = 'standard',
  ): void {
    const key = ghostStorageKey(courseId, weatherCategory);
    this.memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    if (this.memory.size === 0) {
      this.statusSignal.set('empty');
    }
  }

  deleteAllGhosts(): void {
    this.memory.clear();
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('fpv-trainer.course-ghost.v1.')) {
          toRemove.push(key);
        }
      }
      for (const key of toRemove) {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
    this.statusSignal.set('empty');
    this.warningSignal.set(null);
  }

  clearWarning(): void {
    this.warningSignal.set(null);
  }

  private loadFromStorage(
    courseId: string,
    weatherCategory: WeatherRecordCategory = 'standard',
  ): CourseGhostRecord | null {
    const key = ghostStorageKey(courseId, weatherCategory);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      const record = this.validateRecord(parsed, courseId);
      if (!record) {
        localStorage.removeItem(key);
        untracked(() => this.statusSignal.set('corrupt'));
        return null;
      }
      this.memory.set(key, record);
      untracked(() => this.statusSignal.set('persisted'));
      return record;
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
      untracked(() => this.statusSignal.set('corrupt'));
      return null;
    }
  }

  private validateRecord(
    raw: unknown,
    expectedCourseId: string,
  ): CourseGhostRecord | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const obj = raw as Record<string, unknown>;
    if (obj['version'] !== GHOST_RECORD_VERSION) {
      return null;
    }
    if (obj['courseId'] !== expectedCourseId || typeof obj['courseId'] !== 'string') {
      return null;
    }
    if (
      typeof obj['courseVersion'] !== 'number' ||
      !Number.isFinite(obj['courseVersion'])
    ) {
      return null;
    }
    if (typeof obj['environmentId'] !== 'string') {
      return null;
    }
    if (
      typeof obj['finalTimeMs'] !== 'number' ||
      !Number.isFinite(obj['finalTimeMs']) ||
      !(obj['finalTimeMs'] > 0)
    ) {
      return null;
    }
    if (typeof obj['rateProfileId'] !== 'string') {
      return null;
    }
    if (typeof obj['createdAt'] !== 'string') {
      return null;
    }

    const replayResult = validateReplay(obj['replay']);
    if (!replayResult.ok || !replayResult.replay.metadata.completed) {
      return null;
    }
    if (replayResult.replay.metadata.courseId !== expectedCourseId) {
      return null;
    }

    const weatherCategory = obj['weatherCategory'];
    const environmentVersion = obj['environmentVersion'];
    const weatherPresetId = obj['weatherPresetId'];

    if (
      weatherCategory !== undefined &&
      weatherCategory !== 'standard' &&
      weatherCategory !== 'challenge'
    ) {
      return null;
    }
    if (
      environmentVersion !== undefined &&
      (typeof environmentVersion !== 'number' ||
        !Number.isFinite(environmentVersion))
    ) {
      return null;
    }
    if (weatherPresetId !== undefined && typeof weatherPresetId !== 'string') {
      return null;
    }

    return {
      version: GHOST_RECORD_VERSION,
      courseId: expectedCourseId,
      courseVersion: obj['courseVersion'],
      environmentId: obj['environmentId'],
      finalTimeMs: obj['finalTimeMs'],
      replay: replayResult.replay,
      rateProfileId: obj['rateProfileId'],
      createdAt: obj['createdAt'],
      ...(typeof environmentVersion === 'number'
        ? { environmentVersion }
        : {}),
      ...(weatherCategory === 'standard' || weatherCategory === 'challenge'
        ? { weatherCategory }
        : {}),
      ...(typeof weatherPresetId === 'string' ? { weatherPresetId } : {}),
    };
  }

  private persist(
    courseId: string,
    record: CourseGhostRecord,
    weatherCategory: WeatherRecordCategory = 'standard',
  ): { ok: true } | { ok: false; warning: string } {
    try {
      const json = JSON.stringify(record);
      const bytes = json.length * 2;
      if (bytes > GHOST_STORAGE_MAX_BYTES) {
        return {
          ok: false,
          warning: 'Ghost is too large to persist — kept in memory for this session.',
        };
      }
      localStorage.setItem(ghostStorageKey(courseId, weatherCategory), json);
      return { ok: true };
    } catch {
      return {
        ok: false,
        warning: 'Could not persist ghost (storage full or blocked).',
      };
    }
  }
}
