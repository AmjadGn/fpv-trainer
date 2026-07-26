import type { ComponentType } from '@fpv/component-catalog';

import type {
  ComponentPresentationMedia,
  ComponentVisualMetadata,
} from './component-presentation-media.models';

const FALLBACK_ROOT = '/assets/components/fallbacks';
const PRODUCT_ROOT = '/assets/components/products';

const SOURCE = 'FPV Trainer project-owned technical illustration';
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

function product(
  revisionId: string,
  relativePath: string,
  displayName: string,
  visual: ComponentVisualMetadata,
): ComponentPresentationMedia {
  const path = `${PRODUCT_ROOT}/${relativePath}`;
  return {
    componentRevisionId: revisionId,
    thumbnailAssetPath: path,
    imageAssetPath: path,
    altText: `${displayName} — project-owned technical illustration`,
    sourceLabel: SOURCE,
    licenseLabel: LICENSE,
    usesCategoryFallback: false,
    visual,
  };
}

/**
 * Presentation registry keyed by component revision ID.
 * Intentionally separate from the engineering catalog so media changes cannot
 * alter fingerprints or compilation output.
 *
 * Every stocked official-catalog revision has a unique product-specific asset.
 * Category fallbacks are reserved for missing entries / load failures only.
 */
export const COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID: Readonly<
  Record<string, ComponentPresentationMedia>
> = {
  // Frames
  'frame-cine-ducted-220@1': product(
    'frame-cine-ducted-220@1',
    'frames/frame-cine-ducted-220.svg',
    'Cine Ducted 220',
    { category: 'frame' },
  ),
  'frame-hybrid-speed-280@1': product(
    'frame-hybrid-speed-280@1',
    'frames/frame-hybrid-speed-280.svg',
    'Hybrid Speed 280',
    { category: 'frame' },
  ),
  'frame-nano-85@1': product(
    'frame-nano-85@1',
    'frames/frame-nano-85.svg',
    'Nano 85',
    { category: 'frame' },
  ),
  'frame-racing-5in@1': product(
    'frame-racing-5in@1',
    'frames/frame-racing-5in.svg',
    'Racing 5in',
    { category: 'frame' },
  ),
  'frame-freestyle-5in@1': product(
    'frame-freestyle-5in@1',
    'frames/frame-freestyle-5in.svg',
    'Freestyle 5in',
    { category: 'frame' },
  ),
  'frame-longrange-7in@1': product(
    'frame-longrange-7in@1',
    'frames/frame-longrange-7in.svg',
    'Long Range 7in',
    { category: 'frame' },
  ),

  // Motors
  'motor-1404-4500kv@1': product(
    'motor-1404-4500kv@1',
    'motors/motor-1404-4500kv.svg',
    '1404 4500KV',
    { category: 'motor', motorStatorClass: '1404' },
  ),
  'motor-2207-2450kv@1': product(
    'motor-2207-2450kv@1',
    'motors/motor-2207-2450kv.svg',
    '2207 2450KV',
    { category: 'motor', motorStatorClass: '2207' },
  ),
  'motor-1103-10000kv@1': product(
    'motor-1103-10000kv@1',
    'motors/motor-1103-10000kv.svg',
    '1103 10000KV',
    { category: 'motor', motorStatorClass: '1103' },
  ),
  'motor-2306-2750kv@1': product(
    'motor-2306-2750kv@1',
    'motors/motor-2306-2750kv.svg',
    '2306 2750KV',
    { category: 'motor', motorStatorClass: '2306' },
  ),
  'motor-2207-1950kv@1': product(
    'motor-2207-1950kv@1',
    'motors/motor-2207-1950kv.svg',
    '2207 1950KV',
    { category: 'motor', motorStatorClass: '2207' },
  ),
  'motor-2807-1500kv@1': product(
    'motor-2807-1500kv@1',
    'motors/motor-2807-1500kv.svg',
    '2807 1500KV',
    { category: 'motor', motorStatorClass: '2807' },
  ),

  // Propellers
  'prop-ducted-3blade-120@1': product(
    'prop-ducted-3blade-120@1',
    'propellers/prop-ducted-3blade-120.svg',
    'Ducted 120mm 3-blade',
    {
      category: 'propeller',
      propellerBladeCount: 3,
      propellerDiameterClass: '120mm',
    },
  ),
  'prop-5x4x3@1': product(
    'prop-5x4x3@1',
    'propellers/prop-5x4x3.svg',
    '5x4x3',
    {
      category: 'propeller',
      propellerBladeCount: 3,
      propellerDiameterClass: '5in',
    },
  ),
  'prop-5x4.5x3@1': product(
    'prop-5x4.5x3@1',
    'propellers/prop-5x4.5x3.svg',
    '5x4.5x3',
    {
      category: 'propeller',
      propellerBladeCount: 3,
      propellerDiameterClass: '5in',
    },
  ),
  'prop-65mm-2blade@1': product(
    'prop-65mm-2blade@1',
    'propellers/prop-65mm-2blade.svg',
    '65mm 2-blade',
    {
      category: 'propeller',
      propellerBladeCount: 2,
      propellerDiameterClass: '65mm',
    },
  ),
  'prop-6x4x3@1': product(
    'prop-6x4x3@1',
    'propellers/prop-6x4x3.svg',
    '6x4x3',
    {
      category: 'propeller',
      propellerBladeCount: 3,
      propellerDiameterClass: '6in',
    },
  ),
  'prop-7x4x3@1': product(
    'prop-7x4x3@1',
    'propellers/prop-7x4x3.svg',
    '7x4x3',
    {
      category: 'propeller',
      propellerBladeCount: 3,
      propellerDiameterClass: '7in',
    },
  ),

  // Batteries
  'batt-4s-2800@1': product(
    'batt-4s-2800@1',
    'batteries/batt-4s-2800.svg',
    '4S 2800mAh',
    { category: 'battery' },
  ),
  'batt-6s-1500@1': product(
    'batt-6s-1500@1',
    'batteries/batt-6s-1500.svg',
    '6S 1500mAh',
    { category: 'battery' },
  ),
  'batt-6s-2200@1': product(
    'batt-6s-2200@1',
    'batteries/batt-6s-2200.svg',
    '6S 2200mAh',
    { category: 'battery' },
  ),
  'batt-1s-450@1': product(
    'batt-1s-450@1',
    'batteries/batt-1s-450.svg',
    '1S 450mAh',
    { category: 'battery' },
  ),
  'batt-6s-1800@1': product(
    'batt-6s-1800@1',
    'batteries/batt-6s-1800.svg',
    '6S 1800mAh',
    { category: 'battery' },
  ),
  'batt-6s-3000@1': product(
    'batt-6s-3000@1',
    'batteries/batt-6s-3000.svg',
    '6S 3000mAh',
    { category: 'battery' },
  ),

  // ESCs
  'esc-4in1-45a@1': product(
    'esc-4in1-45a@1',
    'escs/esc-4in1-45a.svg',
    '4-in-1 45A',
    { category: 'esc' },
  ),
  'esc-4in1-20a@1': product(
    'esc-4in1-20a@1',
    'escs/esc-4in1-20a.svg',
    '4-in-1 20A',
    { category: 'esc' },
  ),
  'esc-4in1-12a@1': product(
    'esc-4in1-12a@1',
    'escs/esc-4in1-12a.svg',
    '4-in-1 12A',
    { category: 'esc' },
  ),

  // Electronics
  'fc-f7-standard@1': product(
    'fc-f7-standard@1',
    'electronics/fc-f7-standard.svg',
    'F7 FC',
    { category: 'flight-controller' },
  ),
  'cam-fpv-standard@1': product(
    'cam-fpv-standard@1',
    'electronics/cam-fpv-standard.svg',
    'FPV Camera',
    { category: 'camera' },
  ),
  'vtx-25-800@1': product(
    'vtx-25-800@1',
    'electronics/vtx-25-800.svg',
    'VTX 25-800mW',
    { category: 'video-transmitter' },
  ),
  'rx-elrs@1': product(
    'rx-elrs@1',
    'electronics/rx-elrs.svg',
    'ELRS Receiver',
    { category: 'receiver' },
  ),
};
