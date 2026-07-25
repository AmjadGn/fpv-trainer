import type { ReferenceAircraftProfile } from '../models/aircraft-reference-profile.model';

/**
 * Internal engineering references only.
 * Never expose in production selectable catalogs.
 * Public figures only; estimates are labeled.
 */
export const REFERENCE_AIRCRAFT_PROFILES: ReferenceAircraftProfile[] = [
  {
    referenceId: 'ref-dji-avata-2',
    referenceManufacturer: 'DJI',
    referenceModel: 'Avata 2',
    sourceType: 'public-spec',
    publicDimensions: {
      widthMm: 185,
      lengthMm: 212,
      heightMm: 79,
      propellerDiameterInches: 4.7,
      notes: 'Protected cinewhoop class; approximate published envelope.',
    },
    publicWeightGrams: 377,
    publiclyKnownCategory: 'protected cinematic FPV',
    publiclyKnownFlightModes: ['Normal', 'Sport', 'Manual'],
    documentedSources: [
      'Public product specification pages (dimensions/weight class)',
      'Category knowledge of protected cinewhoop handling',
    ],
    estimatedParameters: {
      massKgEstimate: 0.38,
      topSpeedClass: 'moderate',
      angularAgility: 'low-moderate',
    },
    estimationNotes: [
      'Mass/speed used only as class anchors for original commercial craft.',
      'No private firmware or proprietary CAD data used.',
    ],
    confidenceLevel: 'medium',
    internalOnly: true,
    lastReviewedAt: '2026-07-24',
  },
  {
    referenceId: 'ref-dji-fpv',
    referenceManufacturer: 'DJI',
    referenceModel: 'FPV',
    sourceType: 'public-spec',
    publicDimensions: {
      widthMm: 255,
      lengthMm: 306,
      heightMm: 125,
      propellerDiameterInches: 6.5,
      notes: 'Large hybrid FPV class; approximate published envelope.',
    },
    publicWeightGrams: 795,
    publicTopSpeedKmh: 140,
    publiclyKnownCategory: 'high-speed hybrid FPV',
    publiclyKnownFlightModes: ['N', 'S', 'M'],
    documentedSources: [
      'Public product specification pages (size/weight/speed claims)',
    ],
    estimatedParameters: {
      massKgEstimate: 0.8,
      topSpeedClass: 'high',
      angularAgility: 'moderate',
    },
    estimationNotes: [
      'Top speed is a public marketing figure — simulator uses class-scaled limits.',
    ],
    confidenceLevel: 'medium',
    internalOnly: true,
    lastReviewedAt: '2026-07-24',
  },
  {
    referenceId: 'ref-dji-neo',
    referenceManufacturer: 'DJI',
    referenceModel: 'Neo',
    sourceType: 'public-spec',
    publicDimensions: {
      widthMm: 130,
      lengthMm: 157,
      heightMm: 48,
      propellerDiameterInches: 3,
      notes: 'Ultralight micro class; approximate published envelope.',
    },
    publicWeightGrams: 135,
    publiclyKnownCategory: 'ultralight micro FPV',
    publiclyKnownFlightModes: ['Normal', 'Cine', 'Sport'],
    documentedSources: ['Public product specification pages'],
    estimatedParameters: {
      massKgEstimate: 0.14,
      topSpeedClass: 'low',
      windSensitivity: 'high',
    },
    estimationNotes: ['Used only as scale/mass class reference for Nano Scout.'],
    confidenceLevel: 'medium',
    internalOnly: true,
    lastReviewedAt: '2026-07-24',
  },
  {
    referenceId: 'ref-generic-5inch-racing',
    referenceManufacturer: 'generic',
    referenceModel: '5-inch racing quad',
    sourceType: 'category-estimate',
    publicDimensions: {
      propellerDiameterInches: 5,
      notes: 'Typical 5″ racing wheelbase ~220–250 mm class.',
    },
    publicWeightGrams: 550,
    publiclyKnownCategory: '5-inch racing',
    publiclyKnownFlightModes: ['Acro'],
    documentedSources: [
      'Community-typical AUW and rate expectations for 5″ racing quads',
    ],
    estimatedParameters: {
      massKgEstimate: 0.55,
      thrustToWeight: 'high',
      angularAgility: 'very-high',
    },
    estimationNotes: [
      'Category estimate — not tied to any branded racing frame.',
    ],
    confidenceLevel: 'estimated',
    internalOnly: true,
    lastReviewedAt: '2026-07-24',
  },
  {
    referenceId: 'ref-generic-5inch-freestyle',
    referenceManufacturer: 'generic',
    referenceModel: '5-inch freestyle quad',
    sourceType: 'category-estimate',
    publicDimensions: {
      propellerDiameterInches: 5,
      notes: 'Typical freestyle AUW slightly higher than pure racing.',
    },
    publicWeightGrams: 650,
    publiclyKnownCategory: '5-inch freestyle',
    publiclyKnownFlightModes: ['Acro'],
    documentedSources: [
      'Community-typical freestyle handling expectations',
    ],
    estimatedParameters: {
      massKgEstimate: 0.65,
      recoveryStrength: 'high',
      angularAgility: 'high',
    },
    estimationNotes: ['Category estimate for Flux F5 tuning anchors.'],
    confidenceLevel: 'estimated',
    internalOnly: true,
    lastReviewedAt: '2026-07-24',
  },
  {
    referenceId: 'ref-generic-7inch-long-range',
    referenceManufacturer: 'generic',
    referenceModel: '7-inch long-range quad',
    sourceType: 'category-estimate',
    publicDimensions: {
      propellerDiameterInches: 7,
      notes: 'Long-range efficiency / higher inertia class.',
    },
    publicWeightGrams: 900,
    publiclyKnownCategory: '7-inch long-range',
    publiclyKnownFlightModes: ['Acro', 'Angle'],
    documentedSources: [
      'Community-typical 7″ LR mass and glide expectations',
    ],
    estimatedParameters: {
      massKgEstimate: 0.9,
      glideEfficiency: 'high',
      angularAgility: 'low',
    },
    estimationNotes: ['Category estimate for Horizon L7.'],
    confidenceLevel: 'estimated',
    internalOnly: true,
    lastReviewedAt: '2026-07-24',
  },
];

export function getReferenceProfile(
  referenceId: string,
): ReferenceAircraftProfile | undefined {
  return REFERENCE_AIRCRAFT_PROFILES.find((p) => p.referenceId === referenceId);
}
