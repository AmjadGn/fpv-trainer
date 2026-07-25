import { Injectable, signal } from '@angular/core';

import {
  TRAINING_MODULES,
  getTrainingModuleById,
} from '../config/training-modules.config';
import type {
  TrainingMedal,
  TrainingModuleDefinition,
  TrainingResult,
} from '../models/training-module.models';

export const TRAINING_PROGRESS_VERSION = 1;
export const TRAINING_PROGRESS_STORAGE_KEY =
  'fpv-trainer.training-progress.v1';

export interface ModuleProgressRecord {
  moduleId: string;
  moduleVersion: number;
  completed: boolean;
  highestMedal: TrainingMedal;
  bestScore: number;
  bestDurationMs: number;
  attempts: number;
  lastPlayedAt: string;
  bestMetrics: Record<string, number>;
}

export interface TrainingProgressStore {
  version: number;
  modules: Record<string, ModuleProgressRecord>;
}

function emptyStore(): TrainingProgressStore {
  return { version: TRAINING_PROGRESS_VERSION, modules: {} };
}

function medalRank(medal: TrainingMedal): number {
  switch (medal) {
    case 'gold':
      return 3;
    case 'silver':
      return 2;
    case 'bronze':
      return 1;
    case 'none':
    default:
      return 0;
  }
}

function isMedal(value: unknown): value is TrainingMedal {
  return (
    value === 'none' ||
    value === 'bronze' ||
    value === 'silver' ||
    value === 'gold'
  );
}

/**
 * Persists per-module academy progress with versioned localStorage migration.
 */
@Injectable({ providedIn: 'root' })
export class TrainingProgressService {
  private readonly storeSignal = signal<TrainingProgressStore>(
    this.loadFromStorage(),
  );

  readonly store = this.storeSignal.asReadonly();

  getProgress(): TrainingProgressStore {
    return this.storeSignal();
  }

  getModuleProgress(moduleId: string): ModuleProgressRecord | null {
    return this.storeSignal().modules[moduleId] ?? null;
  }

  recordAttempt(moduleId: string, moduleVersion: number): ModuleProgressRecord {
    const current = this.storeSignal();
    const existing = current.modules[moduleId];
    const nextRecord: ModuleProgressRecord = existing
      ? {
          ...existing,
          moduleVersion,
          attempts: existing.attempts + 1,
          lastPlayedAt: new Date().toISOString(),
        }
      : {
          moduleId,
          moduleVersion,
          completed: false,
          highestMedal: 'none',
          bestScore: 0,
          bestDurationMs: 0,
          attempts: 1,
          lastPlayedAt: new Date().toISOString(),
          bestMetrics: {},
        };

    const next: TrainingProgressStore = {
      ...current,
      modules: { ...current.modules, [moduleId]: nextRecord },
    };
    this.storeSignal.set(next);
    this.persist(next);
    return nextRecord;
  }

  recordCompletion(result: TrainingResult): ModuleProgressRecord {
    const current = this.storeSignal();
    const existing = current.modules[result.moduleId];
    const priorMedal = existing?.highestMedal ?? 'none';
    const highestMedal =
      medalRank(result.medal) >= medalRank(priorMedal)
        ? result.medal
        : priorMedal;

    const bestScore = Math.max(
      existing?.bestScore ?? 0,
      Number.isFinite(result.score) ? result.score : 0,
    );
    const bestDurationMs =
      result.completed && Number.isFinite(result.durationMs)
        ? existing?.bestDurationMs && existing.bestDurationMs > 0
          ? Math.min(existing.bestDurationMs, result.durationMs)
          : result.durationMs
        : (existing?.bestDurationMs ?? 0);

    const nextRecord: ModuleProgressRecord = {
      moduleId: result.moduleId,
      moduleVersion: result.moduleVersion,
      completed: (existing?.completed ?? false) || result.completed,
      highestMedal,
      bestScore,
      bestDurationMs,
      attempts: existing?.attempts ?? 1,
      lastPlayedAt: result.completedAt,
      bestMetrics:
        result.completed &&
        (!existing || result.score >= (existing.bestScore ?? 0))
          ? { ...result.metrics }
          : { ...(existing?.bestMetrics ?? {}) },
    };

    const next: TrainingProgressStore = {
      ...current,
      modules: { ...current.modules, [result.moduleId]: nextRecord },
    };
    this.storeSignal.set(next);
    this.persist(next);
    return nextRecord;
  }

  isUnlocked(module: TrainingModuleDefinition): boolean {
    const req = module.unlockRequirements;
    const progress = this.storeSignal().modules;

    const requireAll = req.requireModuleIds ?? [];
    for (const id of requireAll) {
      if (!progress[id]?.completed) {
        return false;
      }
    }

    const requireAny = req.requireAnyModuleIds ?? [];
    if (requireAny.length > 0) {
      const anyOk = requireAny.some((id) => progress[id]?.completed);
      if (!anyOk) {
        return false;
      }
    }

    return true;
  }

  medalRank(medal: TrainingMedal): number {
    return medalRank(medal);
  }

  listUnlockedModules(): TrainingModuleDefinition[] {
    return TRAINING_MODULES.filter(
      (m) => m.enabled && this.isUnlocked(m),
    );
  }

  private loadFromStorage(): TrainingProgressStore {
    try {
      const raw = localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY);
      if (!raw) {
        return emptyStore();
      }
      const parsed: unknown = JSON.parse(raw);
      return this.migrate(parsed);
    } catch {
      return emptyStore();
    }
  }

  private migrate(raw: unknown): TrainingProgressStore {
    if (!raw || typeof raw !== 'object') {
      return emptyStore();
    }
    const obj = raw as Record<string, unknown>;
    const version =
      typeof obj['version'] === 'number' && Number.isFinite(obj['version'])
        ? obj['version']
        : 0;

    // v1 is current; older/unknown shapes fall back safely.
    if (version > TRAINING_PROGRESS_VERSION) {
      return emptyStore();
    }

    const modulesRaw =
      obj['modules'] && typeof obj['modules'] === 'object'
        ? (obj['modules'] as Record<string, unknown>)
        : {};
    const modules: Record<string, ModuleProgressRecord> = {};

    for (const [id, value] of Object.entries(modulesRaw)) {
      const record = this.validateRecord(id, value);
      if (record) {
        modules[id] = record;
      }
    }

    return { version: TRAINING_PROGRESS_VERSION, modules };
  }

  private validateRecord(
    moduleId: string,
    raw: unknown,
  ): ModuleProgressRecord | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const o = raw as Record<string, unknown>;
    if (typeof o['moduleId'] === 'string' && o['moduleId'] !== moduleId) {
      return null;
    }
    const known = getTrainingModuleById(moduleId);
    const moduleVersion =
      typeof o['moduleVersion'] === 'number' &&
      Number.isFinite(o['moduleVersion'])
        ? o['moduleVersion']
        : (known?.version ?? 1);

    const metricsRaw =
      o['bestMetrics'] && typeof o['bestMetrics'] === 'object'
        ? (o['bestMetrics'] as Record<string, unknown>)
        : {};
    const bestMetrics: Record<string, number> = {};
    for (const [k, v] of Object.entries(metricsRaw)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        bestMetrics[k] = v;
      }
    }

    return {
      moduleId,
      moduleVersion,
      completed: o['completed'] === true,
      highestMedal: isMedal(o['highestMedal']) ? o['highestMedal'] : 'none',
      bestScore:
        typeof o['bestScore'] === 'number' && Number.isFinite(o['bestScore'])
          ? o['bestScore']
          : 0,
      bestDurationMs:
        typeof o['bestDurationMs'] === 'number' &&
        Number.isFinite(o['bestDurationMs'])
          ? o['bestDurationMs']
          : 0,
      attempts:
        typeof o['attempts'] === 'number' && Number.isFinite(o['attempts'])
          ? Math.max(0, Math.floor(o['attempts']))
          : 0,
      lastPlayedAt:
        typeof o['lastPlayedAt'] === 'string'
          ? o['lastPlayedAt']
          : new Date(0).toISOString(),
      bestMetrics,
    };
  }

  private persist(store: TrainingProgressStore): void {
    try {
      localStorage.setItem(
        TRAINING_PROGRESS_STORAGE_KEY,
        JSON.stringify(store),
      );
    } catch {
      // Ignore quota / private mode.
    }
  }
}
