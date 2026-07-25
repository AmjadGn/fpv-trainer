import type { ComponentType } from '@fpv/component-catalog';

import type { BuildIntentProfile } from './drone-builder-view.models';

const CORE_CATEGORY_ORDER: readonly ComponentType[] = [
  'frame',
  'motor',
  'propeller',
  'esc',
  'battery',
  'flight-controller',
  'camera',
  'video-transmitter',
  'receiver',
];

/**
 * Intent profiles are product guidance layered on factory presets.
 * They never bypass compatibility validation or alter engineering formulas.
 */
export const BUILD_INTENT_PROFILES: readonly BuildIntentProfile[] = [
  {
    id: 'racing',
    title: 'Racing',
    shortDescription: 'Fast, agile 5-inch track flying',
    plainLanguageGoal:
      'Build a light, responsive racer for gates and timed laps.',
    recommendedFactoryAircraftId: 'apex-r5',
    recommendedCategoryOrder: CORE_CATEGORY_ORDER,
  },
  {
    id: 'freestyle',
    title: 'Freestyle',
    shortDescription: 'Durable tricks and creative flying',
    plainLanguageGoal:
      'Build a tough freestyle craft with room for power and control.',
    recommendedFactoryAircraftId: 'flux-f5',
    recommendedCategoryOrder: CORE_CATEGORY_ORDER,
  },
  {
    id: 'cinematic',
    title: 'Cinematic',
    shortDescription: 'Smooth protected camera flying',
    plainLanguageGoal:
      'Build a stable, forgiving craft for smooth indoor and cinematic shots.',
    recommendedFactoryAircraftId: 'aeroguard-2',
    recommendedCategoryOrder: CORE_CATEGORY_ORDER,
  },
  {
    id: 'long-range',
    title: 'Long Range',
    shortDescription: 'Efficient longer flights',
    plainLanguageGoal:
      'Build an efficient craft that prioritizes flight time and stability.',
    recommendedFactoryAircraftId: 'horizon-l7',
    recommendedCategoryOrder: CORE_CATEGORY_ORDER,
  },
];

export function getBuildIntentProfile(
  id: string | null | undefined,
): BuildIntentProfile | undefined {
  if (!id) return undefined;
  return BUILD_INTENT_PROFILES.find((p) => p.id === id);
}
