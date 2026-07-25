#!/usr/bin/env node
/**
 * Generates project-owned technical catalog illustrations for stocked components.
 * Output is deterministic SVG — no remote assets, no manufacturer branding.
 *
 * Run: node scripts/generate-component-illustrations.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/assets/components/products');

const BG = '#142018';
const LINE = '#6fbf8a';
const FILL = '#2a4034';
const ACCENT = '#8fd6a8';
const MUTED = '#3d5c48';
const DARK = '#1a2a22';

function svg(body, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" role="img" aria-label="${escapeXml(label)}">
  <rect width="160" height="120" fill="${BG}"/>
${body}
</svg>
`;
}

function escapeXml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;');
}

function write(rel, content) {
  const path = join(OUT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

/** Frame: top-down arm geometry differs by class. */
function frameSvg({
  label,
  armLen,
  armWidth,
  bodyW,
  bodyH,
  ducted = false,
  stretchX = 1,
  stretchY = 1,
}) {
  const cx = 80;
  const cy = 60;
  const arms = [
    [1, -1],
    [-1, -1],
    [-1, 1],
    [1, 1],
  ];
  const armPaths = arms
    .map(([sx, sy]) => {
      const ex = cx + sx * armLen * stretchX;
      const ey = cy + sy * armLen * stretchY;
      return `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="${LINE}" stroke-width="${armWidth}" stroke-linecap="round"/>
  <circle cx="${ex}" cy="${ey}" r="${Math.max(4, armWidth + 1)}" fill="${ACCENT}"/>`;
    })
    .join('\n');
  const ducts = ducted
    ? arms
        .map(([sx, sy]) => {
          const ex = cx + sx * armLen * stretchX;
          const ey = cy + sy * armLen * stretchY;
          return `<circle cx="${ex}" cy="${ey}" r="${armLen * 0.42}" fill="none" stroke="${MUTED}" stroke-width="2"/>`;
        })
        .join('\n')
    : '';
  return svg(
    `  ${ducts}
  ${armPaths}
  <rect x="${cx - bodyW / 2}" y="${cy - bodyH / 2}" width="${bodyW}" height="${bodyH}" rx="3" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>
  <rect x="${cx - bodyW / 4}" y="${cy - bodyH / 4}" width="${bodyW / 2}" height="${bodyH / 2}" rx="2" fill="${DARK}"/>`,
    label,
  );
}

/** Motor: side/3q view — diameter and height scale with stator class. */
function motorSvg({
  label,
  bellR,
  bellH,
  shaftH,
  baseW,
  vents = 4,
  flange = false,
  accentRing = false,
  scaleMark = '',
}) {
  const cx = 80;
  const baseY = 98;
  const bellTop = baseY - bellH - 10;
  const shaftTop = bellTop - shaftH;
  const ventPaths = Array.from({ length: vents }, (_, i) => {
    const t = (i + 0.5) / vents;
    const x = cx - bellR + 4 + t * (bellR * 2 - 8);
    const y1 = bellTop + Math.max(4, bellH * 0.15);
    const y2 = bellTop + bellH - Math.max(6, bellH * 0.2);
    return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${MUTED}" stroke-width="1.5"/>`;
  }).join('\n');
  const flangeEl = flange
    ? `<rect x="${cx - baseW / 2 - 6}" y="${baseY - 6}" width="${baseW + 12}" height="8" rx="1" fill="${MUTED}"/>`
    : '';
  const ring = accentRing
    ? `<ellipse cx="${cx}" cy="${bellTop + 5}" rx="${bellR - 3}" ry="3.5" fill="none" stroke="${ACCENT}" stroke-width="2"/>`
    : '';
  // Shared max envelope so relative size is obvious at thumbnail scale.
  const ref = `<ellipse cx="80" cy="55" rx="42" ry="8" fill="none" stroke="${MUTED}" stroke-width="1" stroke-dasharray="3 3" opacity="0.55"/>
  <rect x="38" y="20" width="84" height="78" fill="none" stroke="${MUTED}" stroke-width="1" stroke-dasharray="2 3" opacity="0.35" rx="4"/>`;
  const mark = scaleMark
    ? `<text x="12" y="18" font-family="ui-monospace, monospace" font-size="11" fill="${ACCENT}">${escapeXml(scaleMark)}</text>`
    : '';
  return svg(
    `  ${ref}
  ${mark}
  ${flangeEl}
  <rect x="${cx - baseW / 2}" y="${baseY - 10}" width="${baseW}" height="12" rx="2" fill="${FILL}" stroke="${LINE}" stroke-width="1.5"/>
  <ellipse cx="${cx}" cy="${bellTop + bellH}" rx="${bellR}" ry="7" fill="${FILL}"/>
  <rect x="${cx - bellR}" y="${bellTop}" width="${bellR * 2}" height="${bellH}" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>
  <ellipse cx="${cx}" cy="${bellTop}" rx="${bellR}" ry="7" fill="${DARK}" stroke="${LINE}" stroke-width="2"/>
  ${ventPaths}
  ${ring}
  <rect x="${cx - 2.5}" y="${shaftTop}" width="5" height="${shaftH + 5}" fill="${ACCENT}"/>
  <circle cx="${cx}" cy="${shaftTop}" r="3.5" fill="${ACCENT}"/>
  <line x1="${cx - baseW / 3}" y1="${baseY}" x2="${cx - baseW / 3}" y2="${baseY + 10}" stroke="${MUTED}" stroke-width="2"/>
  <line x1="${cx + baseW / 3}" y1="${baseY}" x2="${cx + baseW / 3}" y2="${baseY + 10}" stroke="${MUTED}" stroke-width="2"/>`,
    label,
  );
}

/** Propeller: top-down; blade count and diameter are authoritative. */
function propSvg({
  label,
  blades,
  radius,
  bladeWidth,
  pitchSweep = 18,
  ducted = false,
  tipShape = 'pointed',
}) {
  const cx = 80;
  const cy = 60;
  const bladeEls = Array.from({ length: blades }, (_, i) => {
    const angle = (360 / blades) * i - 90;
    const tipR = tipShape === 'rounded' ? bladeWidth : 1;
    return `  <g transform="rotate(${angle} ${cx} ${cy})">
    <path d="M${cx} ${cy - 6}
      Q${cx + bladeWidth} ${cy - radius * 0.45} ${cx + pitchSweep * 0.15} ${cy - radius}
      Q${cx - bladeWidth * 0.35} ${cy - radius * 0.7} ${cx} ${cy - 6} Z"
      fill="${FILL}" stroke="${LINE}" stroke-width="1.5" stroke-linejoin="round"/>
    ${tipShape === 'rounded' ? `<circle cx="${cx}" cy="${cy - radius + 2}" r="${Math.max(2, tipR / 3)}" fill="${ACCENT}"/>` : ''}
  </g>`;
  }).join('\n');
  const duct = ducted
    ? `<circle cx="${cx}" cy="${cy}" r="${radius + 8}" fill="none" stroke="${MUTED}" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${radius + 4}" fill="none" stroke="${LINE}" stroke-width="1"/>`
    : '';
  return svg(
    `  ${duct}
${bladeEls}
  <circle cx="${cx}" cy="${cy}" r="8" fill="${DARK}" stroke="${LINE}" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy}" r="3" fill="${ACCENT}"/>`,
    label,
  );
}

/** Battery: pack proportions from cell count + capacity class. */
function batterySvg({ label, cells, length, height, connector = 'xt60' }) {
  const x = 80 - length / 2;
  const y = 60 - height / 2;
  const cellW = length / cells;
  const cellLines = Array.from({ length: cells - 1 }, (_, i) => {
    const lx = x + cellW * (i + 1);
    return `<line x1="${lx}" y1="${y + 2}" x2="${lx}" y2="${y + height - 2}" stroke="${MUTED}" stroke-width="1.5"/>`;
  }).join('\n');
  const conn =
    connector === 'ph2'
      ? `<rect x="${x + length - 6}" y="${y + height / 2 - 3}" width="10" height="6" rx="1" fill="${ACCENT}"/>`
      : `<rect x="${x + length - 4}" y="${y + height / 2 - 5}" width="12" height="10" rx="2" fill="${ACCENT}"/>
  <rect x="${x + length + 6}" y="${y + height / 2 - 2}" width="4" height="4" fill="${LINE}"/>`;
  return svg(
    `  <rect x="${x}" y="${y}" width="${length}" height="${height}" rx="4" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>
  ${cellLines}
  ${conn}
  <rect x="${x + 4}" y="${y + 4}" width="${Math.min(18, length * 0.25)}" height="6" rx="1" fill="${DARK}"/>`,
    label,
  );
}

/** ESC 4-in-1 board sized by current class. */
function escSvg({ label, size, currentBadge }) {
  const x = 80 - size / 2;
  const y = 60 - size / 2;
  const pads = [
    [x + 6, y + 6],
    [x + size - 14, y + 6],
    [x + 6, y + size - 14],
    [x + size - 14, y + size - 14],
  ]
    .map(
      ([px, py]) =>
        `<rect x="${px}" y="${py}" width="8" height="8" rx="1" fill="${ACCENT}"/>`,
    )
    .join('\n');
  return svg(
    `  <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="3" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>
  ${pads}
  <circle cx="80" cy="60" r="8" fill="${DARK}" stroke="${MUTED}" stroke-width="1.5"/>
  <text x="80" y="64" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" fill="${ACCENT}">${escapeXml(currentBadge)}</text>`,
    label,
  );
}

function fcSvg(label) {
  return svg(
    `  <rect x="42" y="32" width="76" height="56" rx="3" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>
  <circle cx="52" cy="42" r="3" fill="${ACCENT}"/><circle cx="108" cy="42" r="3" fill="${ACCENT}"/>
  <circle cx="52" cy="78" r="3" fill="${ACCENT}"/><circle cx="108" cy="78" r="3" fill="${ACCENT}"/>
  <rect x="62" y="48" width="36" height="24" rx="2" fill="${DARK}"/>
  <rect x="68" y="38" width="10" height="6" fill="${MUTED}"/>
  <rect x="82" y="38" width="16" height="6" fill="${MUTED}"/>
  <rect x="70" y="76" width="20" height="5" fill="${MUTED}"/>`,
    label,
  );
}

function cameraSvg(label) {
  return svg(
    `  <rect x="48" y="40" width="44" height="40" rx="4" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>
  <circle cx="70" cy="60" r="14" fill="${DARK}" stroke="${ACCENT}" stroke-width="2"/>
  <circle cx="70" cy="60" r="6" fill="${MUTED}"/>
  <rect x="92" y="50" width="18" height="20" rx="2" fill="${FILL}" stroke="${LINE}" stroke-width="1.5"/>
  <path d="M110 55 L128 48 L128 72 L110 65 Z" fill="${MUTED}" stroke="${LINE}" stroke-width="1.5"/>`,
    label,
  );
}

function vtxSvg(label) {
  return svg(
    `  <rect x="40" y="38" width="70" height="44" rx="3" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>
  <rect x="48" y="46" width="28" height="16" rx="2" fill="${DARK}"/>
  <circle cx="96" cy="60" r="10" fill="${DARK}" stroke="${ACCENT}" stroke-width="2"/>
  <line x1="106" y1="60" x2="128" y2="48" stroke="${LINE}" stroke-width="2"/>
  <circle cx="128" cy="48" r="3" fill="${ACCENT}"/>
  <text x="55" y="74" font-family="ui-monospace, monospace" font-size="9" fill="${ACCENT}">25-800</text>`,
    label,
  );
}

function receiverSvg(label) {
  return svg(
    `  <rect x="55" y="42" width="36" height="28" rx="2" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>
  <rect x="60" y="48" width="12" height="8" fill="${DARK}"/>
  <line x1="91" y1="50" x2="118" y2="30" stroke="${ACCENT}" stroke-width="2"/>
  <line x1="91" y1="62" x2="118" y2="82" stroke="${ACCENT}" stroke-width="2"/>
  <circle cx="118" cy="30" r="2.5" fill="${LINE}"/>
  <circle cx="118" cy="82" r="2.5" fill="${LINE}"/>
  <text x="58" y="78" font-family="ui-monospace, monospace" font-size="10" fill="${ACCENT}">ELRS</text>`,
    label,
  );
}

const assets = [
  // Frames
  [
    'frames/frame-cine-ducted-220.svg',
    frameSvg({
      label: 'Cine ducted 220 frame',
      armLen: 38,
      armWidth: 5,
      bodyW: 28,
      bodyH: 22,
      ducted: true,
    }),
  ],
  [
    'frames/frame-hybrid-speed-280.svg',
    frameSvg({
      label: 'Hybrid speed 280 frame',
      armLen: 48,
      armWidth: 4.5,
      bodyW: 26,
      bodyH: 20,
      stretchX: 1.15,
      stretchY: 1.05,
    }),
  ],
  [
    'frames/frame-nano-85.svg',
    frameSvg({
      label: 'Nano 85 whoop frame',
      armLen: 22,
      armWidth: 3,
      bodyW: 18,
      bodyH: 16,
      ducted: true,
    }),
  ],
  [
    'frames/frame-racing-5in.svg',
    frameSvg({
      label: 'Racing 5-inch frame',
      armLen: 42,
      armWidth: 3.5,
      bodyW: 22,
      bodyH: 18,
      stretchX: 1,
      stretchY: 1,
    }),
  ],
  [
    'frames/frame-freestyle-5in.svg',
    frameSvg({
      label: 'Freestyle 5-inch frame',
      armLen: 44,
      armWidth: 5.5,
      bodyW: 28,
      bodyH: 24,
    }),
  ],
  [
    'frames/frame-longrange-7in.svg',
    frameSvg({
      label: 'Long-range 7-inch frame',
      armLen: 52,
      armWidth: 4,
      bodyW: 30,
      bodyH: 18,
      stretchX: 1.2,
      stretchY: 1.2,
    }),
  ],

  // Motors — exaggerated stator proportions vs shared reference envelope
  [
    'motors/motor-1103-10000kv.svg',
    motorSvg({
      label: '1103 cinewhoop motor',
      bellR: 10,
      bellH: 14,
      shaftH: 6,
      baseW: 14,
      vents: 2,
      scaleMark: '1103',
    }),
  ],
  [
    'motors/motor-1404-4500kv.svg',
    motorSvg({
      label: '1404 compact motor',
      bellR: 15,
      bellH: 20,
      shaftH: 9,
      baseW: 20,
      vents: 3,
      scaleMark: '1404',
    }),
  ],
  [
    'motors/motor-2306-2750kv.svg',
    motorSvg({
      label: '2306 racing motor',
      bellR: 26,
      bellH: 30,
      shaftH: 16,
      baseW: 32,
      vents: 6,
      accentRing: true,
      scaleMark: '2306',
    }),
  ],
  [
    'motors/motor-2207-2450kv.svg',
    motorSvg({
      label: '2207 hybrid motor',
      bellR: 24,
      bellH: 38,
      shaftH: 12,
      baseW: 30,
      vents: 5,
      flange: true,
      scaleMark: '2207',
    }),
  ],
  [
    'motors/motor-2207-1950kv.svg',
    motorSvg({
      label: '2207 freestyle motor',
      bellR: 25,
      bellH: 42,
      shaftH: 18,
      baseW: 34,
      vents: 8,
      flange: true,
      accentRing: true,
      scaleMark: '2207F',
    }),
  ],
  [
    'motors/motor-2807-1500kv.svg',
    motorSvg({
      label: '2807 long-range motor',
      bellR: 36,
      bellH: 46,
      shaftH: 20,
      baseW: 42,
      vents: 9,
      flange: true,
      scaleMark: '2807',
    }),
  ],

  // Propellers — diameter radius exaggerated for thumbnail readability
  [
    'propellers/prop-65mm-2blade.svg',
    propSvg({
      label: '65mm 2-blade propeller',
      blades: 2,
      radius: 22,
      bladeWidth: 8,
      pitchSweep: 8,
      tipShape: 'rounded',
    }),
  ],
  [
    'propellers/prop-ducted-3blade-120.svg',
    propSvg({
      label: 'Ducted 120mm 3-blade propeller',
      blades: 3,
      radius: 36,
      bladeWidth: 13,
      pitchSweep: 10,
      ducted: true,
      tipShape: 'rounded',
    }),
  ],
  [
    'propellers/prop-5x4x3.svg',
    propSvg({
      label: '5x4x3 racing propeller',
      blades: 3,
      radius: 44,
      bladeWidth: 11,
      pitchSweep: 22,
      tipShape: 'pointed',
    }),
  ],
  [
    'propellers/prop-5x4.5x3.svg',
    propSvg({
      label: '5x4.5x3 freestyle propeller',
      blades: 3,
      radius: 45,
      bladeWidth: 17,
      pitchSweep: 28,
      tipShape: 'pointed',
    }),
  ],
  [
    'propellers/prop-6x4x3.svg',
    propSvg({
      label: '6x4x3 hybrid propeller',
      blades: 3,
      radius: 50,
      bladeWidth: 13,
      pitchSweep: 18,
      tipShape: 'pointed',
    }),
  ],
  [
    'propellers/prop-7x4x3.svg',
    propSvg({
      label: '7x4x3 long-range propeller',
      blades: 3,
      radius: 56,
      bladeWidth: 14,
      pitchSweep: 14,
      tipShape: 'rounded',
    }),
  ],

  // Batteries — pack proportions exaggerated for cell/capacity class readability
  [
    'batteries/batt-1s-450.svg',
    batterySvg({
      label: '1S 450mAh battery',
      cells: 1,
      length: 28,
      height: 14,
      connector: 'ph2',
    }),
  ],
  [
    'batteries/batt-4s-2800.svg',
    batterySvg({
      label: '4S 2800mAh battery',
      cells: 4,
      length: 70,
      height: 26,
    }),
  ],
  [
    'batteries/batt-6s-1500.svg',
    batterySvg({
      label: '6S 1500mAh racing battery',
      cells: 6,
      length: 58,
      height: 28,
    }),
  ],
  [
    'batteries/batt-6s-1800.svg',
    batterySvg({
      label: '6S 1800mAh battery',
      cells: 6,
      length: 74,
      height: 30,
    }),
  ],
  [
    'batteries/batt-6s-2200.svg',
    batterySvg({
      label: '6S 2200mAh battery',
      cells: 6,
      length: 90,
      height: 34,
    }),
  ],
  [
    'batteries/batt-6s-3000.svg',
    batterySvg({
      label: '6S 3000mAh endurance battery',
      cells: 6,
      length: 112,
      height: 38,
    }),
  ],

  // ESCs
  [
    'escs/esc-4in1-12a.svg',
    escSvg({ label: '4-in-1 12A ESC', size: 36, currentBadge: '12A' }),
  ],
  [
    'escs/esc-4in1-20a.svg',
    escSvg({ label: '4-in-1 20A ESC', size: 48, currentBadge: '20A' }),
  ],
  [
    'escs/esc-4in1-45a.svg',
    escSvg({ label: '4-in-1 45A ESC', size: 60, currentBadge: '45A' }),
  ],

  // Electronics
  ['electronics/fc-f7-standard.svg', fcSvg('F7 flight controller')],
  ['electronics/cam-fpv-standard.svg', cameraSvg('FPV camera')],
  ['electronics/vtx-25-800.svg', vtxSvg('VTX 25-800mW')],
  ['electronics/rx-elrs.svg', receiverSvg('ELRS receiver')],
];

for (const [rel, content] of assets) {
  write(rel, content);
}

console.log(`Generated ${assets.length} product illustrations under public/assets/components/products/`);
