import type { ComponentType } from '@fpv/component-catalog';

import type { BuildIntentProfile } from './drone-builder-view.models';
import { SIMPLE_STOCKED_CATEGORIES } from './drone-builder-view.models';

/**
 * Intent profiles are product guidance layered on factory presets.
 * They never bypass compatibility validation or alter engineering formulas.
 */
export const BUILD_INTENT_PROFILES: readonly BuildIntentProfile[] = [
  {
    id: 'racing',
    title: 'Racing',
    shortDescription: 'Fast and responsive track flying',
    plainLanguageGoal:
      'A light, sharp craft for gates and timed laps.',
    expectedFeel: 'Quick to turn and accelerate, with less emphasis on flight time.',
    mainTradeOff: 'Speed and agility over endurance and forgiveness.',
    factoryRecommendationLabel: 'Inspired by Apex R5',
    recommendedFactoryAircraftId: 'apex-r5',
    recommendedCategoryOrder: SIMPLE_STOCKED_CATEGORIES,
  },
  {
    id: 'freestyle',
    title: 'Freestyle',
    shortDescription: 'Powerful tricks and creative flying',
    plainLanguageGoal:
      'A tough freestyle craft with room for power and control.',
    expectedFeel: 'Strong pull and durable handling for flips and freestyle lines.',
    mainTradeOff: 'Power and toughness over maximum efficiency.',
    factoryRecommendationLabel: 'Inspired by Flux F5',
    recommendedFactoryAircraftId: 'flux-f5',
    recommendedCategoryOrder: SIMPLE_STOCKED_CATEGORIES,
  },
  {
    id: 'cinematic',
    title: 'Cinematic',
    shortDescription: 'Smooth, stable camera flying',
    plainLanguageGoal:
      'A forgiving craft for smooth indoor and cinematic shots.',
    expectedFeel: 'Smoother and more stable, with room for camera weight.',
    mainTradeOff: 'Stability and ease of use over raw racing speed.',
    factoryRecommendationLabel: 'Inspired by AeroGuard 2',
    recommendedFactoryAircraftId: 'aeroguard-2',
    recommendedCategoryOrder: SIMPLE_STOCKED_CATEGORIES,
  },
  {
    id: 'long-range',
    title: 'Long Range',
    shortDescription: 'Efficient longer flights',
    plainLanguageGoal:
      'An efficient craft that prioritizes flight time and calm handling.',
    expectedFeel: 'Steady cruise feel with longer estimated flight time.',
    mainTradeOff: 'Endurance and efficiency over snap-turn racing agility.',
    factoryRecommendationLabel: 'Inspired by Horizon L7',
    recommendedFactoryAircraftId: 'horizon-l7',
    recommendedCategoryOrder: SIMPLE_STOCKED_CATEGORIES,
  },
];

export function getBuildIntentProfile(
  id: string | null | undefined,
): BuildIntentProfile | undefined {
  if (!id) return undefined;
  return BUILD_INTENT_PROFILES.find((p) => p.id === id);
}

export function defaultBuildNameForIntent(title: string): string {
  return `My ${title} Build`;
}

export function stockedCategoryLabel(category: ComponentType): string {
  switch (category) {
    case 'frame':
      return 'Frame';
    case 'motor':
      return 'Motors';
    case 'propeller':
      return 'Propellers';
    case 'esc':
      return 'ESC';
    case 'battery':
      return 'Battery';
    case 'flight-controller':
      return 'Flight Controller';
    case 'camera':
      return 'FPV Camera';
    case 'video-transmitter':
      return 'VTX';
    case 'receiver':
      return 'Receiver';
    default:
      return category;
  }
}
