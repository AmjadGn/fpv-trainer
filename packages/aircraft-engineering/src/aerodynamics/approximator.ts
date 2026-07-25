import type { ResolvedAssembly } from '@fpv/drone-build-domain';

export interface AerodynamicResult {
  readonly linearDrag: number;
  readonly frontalDragCoefficient: number;
  readonly lateralDragCoefficient: number;
  readonly verticalDragCoefficient: number;
  readonly angularDrag: number;
  readonly propWashStrength: number;
  readonly groundEffectStrength: number;
  readonly groundEffectHeight: number;
  readonly windSensitivity: number;
  readonly glideEfficiency: number;
  readonly modelVersion: string;
  readonly dataProvenance: 'approximate-curated' | 'estimated';
  readonly confidence: 'high' | 'medium' | 'low';
  readonly warnings: readonly string[];
}

/**
 * Approximate aerodynamic model — not wind-tunnel measured.
 */
export function approximateAerodynamics(
  assembly: ResolvedAssembly,
  totalMassKg: number,
): AerodynamicResult {
  let dragFactor = 0.8;
  let frontal = 0.7;
  let propWash = 0.5;
  let ground = 0.2;
  let wind = 0.6;
  let glide = 0.5;

  for (const s of assembly.revision.selections) {
    const c = assembly.componentBySelectionId.get(s.selectionId);
    if (!c) continue;
    if (c.engineering.type === 'frame') {
      dragFactor = c.engineering.frame.dragProfileFactor;
      frontal = 0.5 + dragFactor * 0.4;
    }
    if (
      c.engineering.type === 'camera' ||
      c.engineering.type === 'payload' ||
      c.engineering.type === 'protective-accessory'
    ) {
      frontal += c.engineering.electronics.dragContribution;
    }
    if (c.componentType === 'propeller') {
      propWash += 0.05;
    }
  }

  wind = Math.min(1.8, 0.35 + 0.15 / Math.max(0.08, totalMassKg));
  ground = Math.min(0.4, 0.12 + 0.08 / Math.max(0.1, totalMassKg));
  glide = Math.max(0.2, 0.75 - dragFactor * 0.25);

  return {
    linearDrag: Math.min(1.2, 0.25 + dragFactor * 0.45),
    frontalDragCoefficient: frontal,
    lateralDragCoefficient: frontal * 1.05,
    verticalDragCoefficient: frontal * 0.95,
    angularDrag: Math.min(0.55, 0.15 + dragFactor * 0.2),
    propWashStrength: Math.min(1, propWash),
    groundEffectStrength: ground,
    groundEffectHeight: 0.35 + Math.min(0.4, totalMassKg * 0.2),
    windSensitivity: wind,
    glideEfficiency: glide,
    modelVersion: '1.1.0-approx',
    dataProvenance: 'approximate-curated',
    confidence: 'low',
    warnings: ['aerodynamics are approximate — not measured coefficients'],
  };
}
