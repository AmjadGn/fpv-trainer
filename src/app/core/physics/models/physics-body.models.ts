import type { CollisionMaterialId } from './collision.models';

export interface CollisionMaterialProfile {
  id: CollisionMaterialId;
  friction: number;
  restitution: number;
  impactAudio: string;
  scrapeAudio: string;
  particleEffect:
    | 'dust'
    | 'grass'
    | 'sparks'
    | 'concrete'
    | 'wood'
    | 'splash'
    | 'smoke'
    | 'none';
  damageMultiplier: number;
}

export const COLLISION_MATERIALS: Record<
  CollisionMaterialId,
  CollisionMaterialProfile
> = {
  grass: {
    id: 'grass',
    friction: 0.55,
    restitution: 0.08,
    impactAudio: 'grass',
    scrapeAudio: 'scrapeSoft',
    particleEffect: 'grass',
    damageMultiplier: 0.55,
  },
  dirt: {
    id: 'dirt',
    friction: 0.6,
    restitution: 0.1,
    impactAudio: 'dirt',
    scrapeAudio: 'scrapeSoft',
    particleEffect: 'dust',
    damageMultiplier: 0.7,
  },
  rock: {
    id: 'rock',
    friction: 0.7,
    restitution: 0.15,
    impactAudio: 'rock',
    scrapeAudio: 'scrapeHard',
    particleEffect: 'concrete',
    damageMultiplier: 1.15,
  },
  concrete: {
    id: 'concrete',
    friction: 0.65,
    restitution: 0.12,
    impactAudio: 'concrete',
    scrapeAudio: 'scrapeHard',
    particleEffect: 'concrete',
    damageMultiplier: 1.25,
  },
  metal: {
    id: 'metal',
    friction: 0.45,
    restitution: 0.18,
    impactAudio: 'metal',
    scrapeAudio: 'scrapeMetal',
    particleEffect: 'sparks',
    damageMultiplier: 1.2,
  },
  wood: {
    id: 'wood',
    friction: 0.55,
    restitution: 0.2,
    impactAudio: 'wood',
    scrapeAudio: 'scrapeSoft',
    particleEffect: 'wood',
    damageMultiplier: 0.9,
  },
  plastic: {
    id: 'plastic',
    friction: 0.4,
    restitution: 0.35,
    impactAudio: 'plastic',
    scrapeAudio: 'scrapeSoft',
    particleEffect: 'dust',
    damageMultiplier: 0.65,
  },
  cardboard: {
    id: 'cardboard',
    friction: 0.5,
    restitution: 0.15,
    impactAudio: 'wood',
    scrapeAudio: 'scrapeSoft',
    particleEffect: 'wood',
    damageMultiplier: 0.4,
  },
  water: {
    id: 'water',
    friction: 0.05,
    restitution: 0,
    impactAudio: 'splash',
    scrapeAudio: 'splash',
    particleEffect: 'splash',
    damageMultiplier: 2,
  },
  droneCarbon: {
    id: 'droneCarbon',
    friction: 0.4,
    restitution: 0.1,
    impactAudio: 'plastic',
    scrapeAudio: 'scrapeSoft',
    particleEffect: 'sparks',
    damageMultiplier: 1,
  },
};

export function getCollisionMaterial(
  id: CollisionMaterialId | string | undefined,
): CollisionMaterialProfile {
  if (id && id in COLLISION_MATERIALS) {
    return COLLISION_MATERIALS[id as CollisionMaterialId];
  }
  return COLLISION_MATERIALS.concrete;
}
