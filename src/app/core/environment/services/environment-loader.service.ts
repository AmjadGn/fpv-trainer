import { Injectable, inject, signal } from '@angular/core';

import type { Course } from '../../course/models/course.model';
import type { TrainerEnvironmentSettings } from '../../settings/models/trainer-settings.model';
import type {
  EnvironmentLoadStage,
  EnvironmentDefinition,
  GeneratedEnvironment,
} from '../models/environment.model';
import { ALPINE_ENVIRONMENT_ID } from '../models/environment-registry.model';
import { EnvironmentGeneratorService } from './environment-generator.service';
import { EnvironmentRegistryService } from './environment-registry.service';

export type EnvironmentLoaderState = EnvironmentLoadStage;

export interface EnvironmentLoadRequest {
  environmentId: string;
  course: Course;
  settings: TrainerEnvironmentSettings;
  fallback?: boolean;
}

export interface EnvironmentLoadResult {
  ok: boolean;
  generated: GeneratedEnvironment;
  definition: EnvironmentDefinition;
  stage: EnvironmentLoaderState;
  usedFallback: boolean;
  errorMessage: string | null;
}

/**
 * Orchestrates environment generation lifecycle and progress stages.
 * Does not own Three.js disposal — caller disposes renderer before reload.
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentLoaderService {
  private readonly registry = inject(EnvironmentRegistryService);
  private readonly generator = inject(EnvironmentGeneratorService);

  private readonly _stage = signal<EnvironmentLoaderState>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _ready = signal(false);
  private readonly _environmentId = signal(ALPINE_ENVIRONMENT_ID);
  private loadGeneration = 0;

  readonly stage = this._stage.asReadonly();
  readonly error = this._error.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly environmentId = this._environmentId.asReadonly();

  load(
    request: EnvironmentLoadRequest,
    onProgress?: (stage: EnvironmentLoadStage) => void,
  ): EnvironmentLoadResult {
    const gen = ++this.loadGeneration;
    this._ready.set(false);
    this._error.set(null);

    const report = (stage: EnvironmentLoadStage): void => {
      if (gen !== this.loadGeneration) {
        return;
      }
      this._stage.set(stage);
      onProgress?.(stage);
    };

    try {
      report('validating');
      const meta = this.registry.resolve(request.environmentId);
      this._environmentId.set(meta.id);

      report('disposingPrevious');
      report('generatingTerrain');

      const definition = meta.definition;
      const generated = this.generator.generate({
        definition,
        course: request.course,
        settings: request.settings,
        fallback: request.fallback === true,
      });

      report('generatingScenery');
      report('generatingCourse');
      report('preparingWeather');

      const usedFallback =
        request.fallback === true || generated.definitionId === 'fallback-flat';

      if (gen !== this.loadGeneration) {
        return {
          ok: false,
          generated,
          definition,
          stage: 'error',
          usedFallback,
          errorMessage: 'Load superseded',
        };
      }

      const finalStage: EnvironmentLoadStage = usedFallback
        ? 'fallback'
        : 'ready';
      report(finalStage);
      this._ready.set(true);

      return {
        ok: true,
        generated,
        definition,
        stage: finalStage,
        usedFallback,
        errorMessage: null,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Environment generation failed';
      this._error.set(message);
      report('error');

      try {
        const alpine = this.registry.resolve(ALPINE_ENVIRONMENT_ID);
        const generated = this.generator.generate({
          definition: alpine.definition,
          course: request.course,
          settings: request.settings,
          fallback: true,
        });
        report('fallback');
        this._ready.set(true);
        this._environmentId.set(ALPINE_ENVIRONMENT_ID);
        return {
          ok: true,
          generated,
          definition: alpine.definition,
          stage: 'fallback',
          usedFallback: true,
          errorMessage: message,
        };
      } catch (fallbackErr) {
        const fb =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : 'Fallback failed';
        this._ready.set(false);
        this._stage.set('error');
        this._error.set(`${message}; ${fb}`);
        const alpine = this.registry.resolve(ALPINE_ENVIRONMENT_ID);
        const generated = this.generator.generate({
          definition: alpine.definition,
          course: request.course,
          settings: request.settings,
          fallback: true,
        });
        return {
          ok: false,
          generated,
          definition: alpine.definition,
          stage: 'error',
          usedFallback: true,
          errorMessage: this._error(),
        };
      }
    }
  }

  reset(): void {
    this.loadGeneration++;
    this._stage.set('idle');
    this._error.set(null);
    this._ready.set(false);
  }
}
