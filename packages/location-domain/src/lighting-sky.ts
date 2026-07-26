/**
 * Minimal authored lighting/sky metadata for a location.
 *
 * Deliberately plain numeric data — no `THREE.DirectionalLight`, no
 * `THREE.Color`, no renderer objects of any kind. Adapting this into an
 * actual renderer's light/sky objects is an application-layer concern
 * outside this package.
 */

import type { Vec3 } from '@fpv/simulation-contracts';

export interface LinearRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface DirectionalLightConfiguration {
  /** World-space unit vector the light travels along (light-to-surface direction). */
  readonly direction: Vec3;
  readonly intensity: number;
  readonly color: LinearRgb;
}

export interface AmbientLightConfiguration {
  readonly intensity: number;
  readonly color: LinearRgb;
}

export interface LightingConfiguration {
  readonly directional: DirectionalLightConfiguration;
  readonly ambient: AmbientLightConfiguration;
}

export type SkyMode = 'clear' | 'overcast' | 'sunset' | 'night' | 'procedural-gradient';

export interface SkyConfiguration {
  readonly mode: SkyMode;
  readonly zenithColor?: LinearRgb;
  readonly horizonColor?: LinearRgb;
  /** Optional atmospheric turbidity hint for procedural sky renderers. */
  readonly turbidity?: number;
}
