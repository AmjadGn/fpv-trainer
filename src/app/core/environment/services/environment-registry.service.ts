import { Injectable } from '@angular/core';

import { ALPINE_TRAINING_VALLEY } from '../config/alpine-valley.config';
import { COASTAL_RUINS } from '../config/coastal-ruins.config';
import { DESERT_INDUSTRIAL_YARD } from '../config/desert-industrial.config';
import type { EnvironmentDefinition } from '../models/environment.model';
import {
  ALPINE_ENVIRONMENT_ID,
  COASTAL_ENVIRONMENT_ID,
  DESERT_ENVIRONMENT_ID,
  type EnvironmentCompatibility,
  type EnvironmentMetadata,
} from '../models/environment-registry.model';
import { listWeatherPresetsForEnvironment } from '../../weather/config/weather-presets.config';

const ENVIRONMENTS: EnvironmentMetadata[] = [
  {
    id: ALPINE_ENVIRONMENT_ID,
    version: 1,
    name: 'Alpine Training Valley',
    description:
      'A green alpine valley with mountains, trees, and a clear beginner corridor.',
    theme: 'alpine',
    difficulty: 'beginner',
    worldSize: ALPINE_TRAINING_VALLEY.worldSize,
    supportedCourses: ['starter-circuit'],
    supportedTrainingModules: [
      'hover-control',
      'precision-landing',
      'gate-basics',
      'figure-eight',
      'crosswind-fundamentals',
    ],
    recommendedQuality: 'medium',
    supportsVegetation: true,
    supportsPrecipitation: ['none', 'lightSnow'],
    supportsFog: true,
    supportsWind: true,
    thumbnail: {
      style: 'alpine',
      primaryColor: '#4a6b4a',
      secondaryColor: '#8fb4c8',
      accentColor: '#c4a574',
    },
    enabled: true,
    comingSoon: false,
    defaultWeatherPresetId: 'calm',
    definition: ALPINE_TRAINING_VALLEY,
  },
  {
    id: DESERT_ENVIRONMENT_ID,
    version: 1,
    name: 'Desert Industrial Yard',
    description:
      'A dry industrial compound with containers, hangars, and technical corridors.',
    theme: 'desert-industrial',
    difficulty: 'intermediate',
    worldSize: DESERT_INDUSTRIAL_YARD.worldSize,
    supportedCourses: ['industrial-sprint'],
    supportedTrainingModules: [],
    recommendedQuality: 'medium',
    supportsVegetation: false,
    supportsPrecipitation: ['none', 'dust'],
    supportsFog: true,
    supportsWind: true,
    thumbnail: {
      style: 'desert',
      primaryColor: '#c4a574',
      secondaryColor: '#8a7a68',
      accentColor: '#6b5344',
    },
    enabled: true,
    comingSoon: false,
    defaultWeatherPresetId: 'desert-calm',
    definition: DESERT_INDUSTRIAL_YARD,
  },
  {
    id: COASTAL_ENVIRONMENT_ID,
    version: 1,
    name: 'Coastal Ruins',
    description:
      'Cliffside plateau ruins above a scenic sea with arches and a lighthouse.',
    theme: 'coastal',
    difficulty: 'intermediate',
    worldSize: COASTAL_RUINS.worldSize,
    supportedCourses: ['coastal-run'],
    supportedTrainingModules: [],
    recommendedQuality: 'medium',
    supportsVegetation: true,
    supportsPrecipitation: ['none', 'rain'],
    supportsFog: true,
    supportsWind: true,
    thumbnail: {
      style: 'coastal',
      primaryColor: '#5a7a5a',
      secondaryColor: '#3a6a8a',
      accentColor: '#c8c0b0',
    },
    enabled: true,
    comingSoon: false,
    defaultWeatherPresetId: 'coastal-calm',
    definition: COASTAL_RUINS,
  },
];

/**
 * Central registry of playable environments.
 * UI menus must read from here — do not hardcode environment lists in components.
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentRegistryService {
  private readonly byId = new Map<string, EnvironmentMetadata>();

  constructor() {
    for (const env of ENVIRONMENTS) {
      this.register(env);
    }
  }

  register(meta: EnvironmentMetadata): void {
    const validated = this.validate(meta);
    if (!validated.ok) {
      console.warn(
        `[EnvironmentRegistry] Rejected "${meta.id}": ${validated.reason}`,
      );
      return;
    }
    if (this.byId.has(meta.id)) {
      console.warn(
        `[EnvironmentRegistry] Duplicate id "${meta.id}" — keeping first registration.`,
      );
      return;
    }
    this.byId.set(meta.id, meta);
  }

  get(id: string): EnvironmentMetadata | null {
    return this.byId.get(id) ?? null;
  }

  /** Safe resolve with Alpine fallback. */
  resolve(id: string | null | undefined): EnvironmentMetadata {
    if (id && this.byId.has(id)) {
      const meta = this.byId.get(id)!;
      if (meta.enabled) {
        return meta;
      }
    }
    return this.byId.get(ALPINE_ENVIRONMENT_ID) ?? ENVIRONMENTS[0]!;
  }

  getDefinition(id: string | null | undefined): EnvironmentDefinition {
    return this.resolve(id).definition;
  }

  listEnabled(): EnvironmentMetadata[] {
    return [...this.byId.values()].filter((e) => e.enabled && !e.comingSoon);
  }

  listAll(): EnvironmentMetadata[] {
    return [...this.byId.values()];
  }

  supportsCourse(environmentId: string, courseId: string): boolean {
    const env = this.get(environmentId);
    if (!env || !env.enabled) {
      return false;
    }
    return env.supportedCourses.includes(courseId);
  }

  getCompatibility(environmentId: string): EnvironmentCompatibility | null {
    const env = this.get(environmentId);
    if (!env) {
      return null;
    }
    const presets = listWeatherPresetsForEnvironment(env.id).map((p) => p.id);
    return {
      environmentId: env.id,
      environmentVersion: env.version,
      courseIds: env.supportedCourses,
      trainingModuleIds: env.supportedTrainingModules,
      weatherPresetIds: presets,
    };
  }

  validate(
    meta: EnvironmentMetadata,
  ): { ok: true } | { ok: false; reason: string } {
    if (!meta.id || typeof meta.id !== 'string') {
      return { ok: false, reason: 'Missing id' };
    }
    if (!meta.name) {
      return { ok: false, reason: 'Missing name' };
    }
    if (!(meta.version >= 1)) {
      return { ok: false, reason: 'Invalid version' };
    }
    if (!(meta.worldSize > 0) || !Number.isFinite(meta.worldSize)) {
      return { ok: false, reason: 'Invalid worldSize' };
    }
    if (!meta.definition || meta.definition.id !== meta.id) {
      return { ok: false, reason: 'Definition id mismatch' };
    }
    if (!Array.isArray(meta.supportedCourses)) {
      return { ok: false, reason: 'supportedCourses required' };
    }
    return { ok: true };
  }
}
