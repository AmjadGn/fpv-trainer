import { Injectable } from '@angular/core';

import type { Course } from '../../course/models/course.model';
import type { GeneratedEnvironment } from '../models/environment.model';
import type { EnvironmentColliderDefinition } from '../../physics/models/collision.models';
import {
  buildEnvironmentColliderManifest,
  filterCollidersForQuality,
} from './environment-collider-builder.service';

export interface ColliderManifest {
  version: string;
  environmentId: string;
  colliders: EnvironmentColliderDefinition[];
}

/**
 * Authoring entry point for environment colliders.
 * Generates manifests from GeneratedEnvironment — does not touch Three.js or Rapier directly.
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentColliderBuilderService {
  build(
    env: GeneratedEnvironment,
    options?: {
      allowDynamicProps?: boolean;
      quality?: 'low' | 'medium' | 'high';
      /** Ranked races: prefer static-only competitive props. */
      competitive?: boolean;
      /** Active course — used for gate frame colliders. */
      course?: Course | null;
    },
  ): ColliderManifest {
    const allowDynamic =
      options?.competitive === true
        ? false
        : options?.allowDynamicProps !== false;
    const raw = buildEnvironmentColliderManifest(env, {
      allowDynamicProps: allowDynamic,
      quality: options?.quality,
      course: options?.course ?? null,
    });
    const quality = options?.quality ?? env.quality ?? 'medium';
    return {
      version: raw.version,
      environmentId: env.definitionId,
      colliders: filterCollidersForQuality(raw.colliders, quality),
    };
  }
}
