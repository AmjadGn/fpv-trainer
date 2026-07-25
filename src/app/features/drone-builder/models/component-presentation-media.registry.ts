import type { ComponentType } from '@fpv/component-catalog';

import type { ComponentPresentationMedia } from './component-presentation-media.models';

const FALLBACK_ROOT = '/assets/components/fallbacks';
const ILLUSTRATION_ROOT = '/assets/components/illustrations';

const SOURCE = 'FPV Trainer project-owned silhouette';
const LICENSE = 'Project asset · not commercial product photography';

/** Category fallback paths — clearly generic silhouettes. */
export const CATEGORY_FALLBACK_ASSET_PATHS: Readonly<
  Record<ComponentType | 'unknown', string>
> = {
  frame: `${FALLBACK_ROOT}/frame.svg`,
  motor: `${FALLBACK_ROOT}/motor.svg`,
  propeller: `${FALLBACK_ROOT}/propeller.svg`,
  esc: `${FALLBACK_ROOT}/esc.svg`,
  battery: `${FALLBACK_ROOT}/battery.svg`,
  'flight-controller': `${FALLBACK_ROOT}/flight-controller.svg`,
  camera: `${FALLBACK_ROOT}/camera.svg`,
  'video-transmitter': `${FALLBACK_ROOT}/video-transmitter.svg`,
  receiver: `${FALLBACK_ROOT}/receiver.svg`,
  antenna: `${FALLBACK_ROOT}/generic.svg`,
  'gps-module': `${FALLBACK_ROOT}/generic.svg`,
  payload: `${FALLBACK_ROOT}/generic.svg`,
  'protective-accessory': `${FALLBACK_ROOT}/generic.svg`,
  cosmetic: `${FALLBACK_ROOT}/generic.svg`,
  unknown: `${FALLBACK_ROOT}/generic.svg`,
};

function categoryEntry(
  revisionId: string,
  category: ComponentType,
  displayName: string,
): ComponentPresentationMedia {
  const path = CATEGORY_FALLBACK_ASSET_PATHS[category];
  return {
    componentRevisionId: revisionId,
    thumbnailAssetPath: path,
    imageAssetPath: path,
    altText: `${displayName} — generic ${category.replace(/-/g, ' ')} illustration`,
    sourceLabel: SOURCE,
    licenseLabel: LICENSE,
    usesCategoryFallback: true,
  };
}

/**
 * Presentation registry keyed by component revision ID.
 * Intentionally separate from the engineering catalog so media changes cannot
 * alter fingerprints or compilation output.
 *
 * Most stocked parts intentionally use generic category silhouettes.
 * One dedicated project illustration exists for a known racing frame so the
 * registry can demonstrate a non-fallback mapping without branded photography.
 */
export const COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID: Readonly<
  Record<string, ComponentPresentationMedia>
> = {
  // Frames
  'frame-cine-ducted-220@1': categoryEntry(
    'frame-cine-ducted-220@1',
    'frame',
    'Cine Ducted 220',
  ),
  'frame-hybrid-speed-280@1': categoryEntry(
    'frame-hybrid-speed-280@1',
    'frame',
    'Hybrid Speed 280',
  ),
  'frame-nano-85@1': categoryEntry('frame-nano-85@1', 'frame', 'Nano 85'),
  'frame-racing-5in@1': {
    componentRevisionId: 'frame-racing-5in@1',
    thumbnailAssetPath: `${ILLUSTRATION_ROOT}/frame-racing-5in.svg`,
    imageAssetPath: `${ILLUSTRATION_ROOT}/frame-racing-5in.svg`,
    altText: 'Racing 5-inch frame — project-owned illustration',
    sourceLabel: SOURCE,
    licenseLabel: LICENSE,
    usesCategoryFallback: false,
  },
  'frame-freestyle-5in@1': categoryEntry(
    'frame-freestyle-5in@1',
    'frame',
    'Freestyle 5-inch',
  ),
  'frame-longrange-7in@1': categoryEntry(
    'frame-longrange-7in@1',
    'frame',
    'Long Range 7-inch',
  ),

  // Motors
  'motor-1404-4500kv@1': categoryEntry(
    'motor-1404-4500kv@1',
    'motor',
    '1404 4500KV',
  ),
  'motor-2207-2450kv@1': categoryEntry(
    'motor-2207-2450kv@1',
    'motor',
    '2207 2450KV',
  ),
  'motor-1103-10000kv@1': categoryEntry(
    'motor-1103-10000kv@1',
    'motor',
    '1103 10000KV',
  ),
  'motor-2306-2750kv@1': categoryEntry(
    'motor-2306-2750kv@1',
    'motor',
    '2306 2750KV',
  ),
  'motor-2207-1950kv@1': categoryEntry(
    'motor-2207-1950kv@1',
    'motor',
    '2207 1950KV',
  ),
  'motor-2807-1500kv@1': categoryEntry(
    'motor-2807-1500kv@1',
    'motor',
    '2807 1500KV',
  ),

  // Propellers
  'prop-ducted-3blade-120@1': categoryEntry(
    'prop-ducted-3blade-120@1',
    'propeller',
    'Ducted 120mm 3-blade',
  ),
  'prop-5x4x3@1': categoryEntry('prop-5x4x3@1', 'propeller', '5x4x3'),
  'prop-5x4.5x3@1': categoryEntry('prop-5x4.5x3@1', 'propeller', '5x4.5x3'),
  'prop-65mm-2blade@1': categoryEntry(
    'prop-65mm-2blade@1',
    'propeller',
    '65mm 2-blade',
  ),
  'prop-6x4x3@1': categoryEntry('prop-6x4x3@1', 'propeller', '6x4x3'),
  'prop-7x4x3@1': categoryEntry('prop-7x4x3@1', 'propeller', '7x4x3'),

  // Batteries
  'batt-4s-2800@1': categoryEntry('batt-4s-2800@1', 'battery', '4S 2800mAh'),
  'batt-6s-1500@1': categoryEntry('batt-6s-1500@1', 'battery', '6S 1500mAh'),
  'batt-6s-2200@1': categoryEntry('batt-6s-2200@1', 'battery', '6S 2200mAh'),
  'batt-1s-450@1': categoryEntry('batt-1s-450@1', 'battery', '1S 450mAh'),
  'batt-6s-1800@1': categoryEntry('batt-6s-1800@1', 'battery', '6S 1800mAh'),
  'batt-6s-3000@1': categoryEntry('batt-6s-3000@1', 'battery', '6S 3000mAh'),

  // ESCs
  'esc-4in1-45a@1': categoryEntry('esc-4in1-45a@1', 'esc', '4-in-1 45A'),
  'esc-4in1-20a@1': categoryEntry('esc-4in1-20a@1', 'esc', '4-in-1 20A'),
  'esc-4in1-12a@1': categoryEntry('esc-4in1-12a@1', 'esc', '4-in-1 12A'),

  // Electronics
  'fc-f7-standard@1': categoryEntry(
    'fc-f7-standard@1',
    'flight-controller',
    'F7 FC',
  ),
  'cam-fpv-standard@1': categoryEntry(
    'cam-fpv-standard@1',
    'camera',
    'FPV Camera',
  ),
  'vtx-25-800@1': categoryEntry('vtx-25-800@1', 'video-transmitter', 'VTX 25-800mW'),
  'rx-elrs@1': categoryEntry('rx-elrs@1', 'receiver', 'ELRS Receiver'),
};
