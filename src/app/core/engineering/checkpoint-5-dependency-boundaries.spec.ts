import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Checkpoint 5 dependency boundaries.
 *
 * Mirrors the Checkpoint 3/4 layering assertions and extends them to the
 * photography capture loop: the mission runtime must stay renderer-free,
 * the pure capture modules must stay Angular-free, and the presentation
 * frame capture must remain a one-shot offscreen render that restores and
 * disposes everything it touches.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') {
        continue;
      }
      walk(full, out);
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Strips comments so documentation prose cannot trip a source scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function violationsIn(files: readonly string[], forbidden: readonly RegExp[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const text = stripComments(readFileSync(file, 'utf8'));
    for (const pattern of forbidden) {
      if (pattern.test(text)) {
        violations.push(`${file} matched ${pattern}`);
      }
    }
  }
  return violations;
}

/** Extracts a method body by brace matching from the marker that opens it. */
function methodBody(source: string, signature: string, bodyMarker: string): string {
  const start = source.indexOf(signature);
  expect(start, `signature not found: ${signature}`).toBeGreaterThan(-1);
  const markerIndex = source.indexOf(bodyMarker, start);
  expect(markerIndex, `body marker not found: ${bodyMarker}`).toBeGreaterThan(-1);
  const open = source.indexOf('{', markerIndex);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') {
      depth += 1;
    } else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(open, i + 1);
      }
    }
  }
  throw new Error(`unbalanced braces for ${signature}`);
}

describe('Checkpoint 5 dependency boundaries', () => {
  it('pure packages remain free of Angular / Three / Rapier / src/app', () => {
    const files = walk(join(ROOT, 'packages'));
    const violations = violationsIn(files, [
      /from\s+['"]@angular\//,
      /from\s+['"]three/,
      /from\s+['"]@dimforge\/rapier/,
      /from\s+['"].*src\/app/,
    ]);
    expect(violations).toEqual([]);
  });

  it('photography-domain stays independent of mission and location domains', () => {
    const files = walk(join(ROOT, 'packages/photography-domain'));
    const violations = violationsIn(files, [
      /from\s+['"]@fpv\/mission-domain['"]/,
      /from\s+['"]@fpv\/location-domain['"]/,
    ]);
    expect(violations).toEqual([]);
  });

  it('mission feature components do not import Rapier, Three, or photography scoring', () => {
    const files = walk(join(ROOT, 'src/app/features/missions'));
    const violations = violationsIn(files, [
      /from\s+['"]@dimforge\/rapier/,
      /from\s+['"]three/,
      /evaluatePhotoCapture/,
      /createPhotoCaptureEvidence/,
      /PhotoEvidenceBuilder/,
      /projectSubjectSamplePoints/,
    ]);
    expect(violations).toEqual([]);
  });

  it('location content package does not import Three or Rapier modules', () => {
    const files = walk(
      join(ROOT, 'src/app/content/locations/mediterranean-expedition-region'),
    ).filter((file) => !file.endsWith('collision-descriptors.ts'));
    const violations = violationsIn(files, [
      /from\s+['"]three/,
      /from\s+['"]@dimforge\/rapier/,
    ]);
    expect(violations).toEqual([]);
  });

  it('mission runtime services and ports never import Three or Rapier', () => {
    const files = [
      ...walk(join(ROOT, 'src/app/core/mission/services')),
      ...walk(join(ROOT, 'src/app/core/mission/ports')),
      ...walk(join(ROOT, 'src/app/core/mission/models')),
    ];
    const violations = violationsIn(files, [
      /from\s+['"]three/,
      /from\s+['"]@dimforge\/rapier/,
      /rendering\/services\/three-renderer/,
    ]);
    expect(violations).toEqual([]);
  });

  it('the pure capture modules stay free of Angular, rendering, and persistence', () => {
    const pureModules = [
      'src/app/core/mission/services/photo-stability-window.ts',
      'src/app/core/mission/services/mission-boundary-runtime.ts',
    ].map((relative) => join(ROOT, relative));
    const violations = violationsIn(pureModules, [
      /from\s+['"]@angular\//,
      /from\s+['"]three/,
      /from\s+['"]@dimforge\/rapier/,
      /indexedDB/,
      /localStorage/,
    ]);
    expect(violations).toEqual([]);
  });

  it('mission runtime services do not open IndexedDB or Web Storage APIs', () => {
    const files = walk(join(ROOT, 'src/app/core/mission'));
    const violations = violationsIn(files, [/indexedDB/, /localStorage/, /sessionStorage/]);
    expect(violations).toEqual([]);
  });

  it('the presentation capture port is a plain DTO seam with a fixed 1280x720 frame', () => {
    const port = readFileSync(
      join(ROOT, 'src/app/core/mission/ports/mission-photo-presentation-capture.port.ts'),
      'utf8',
    );
    expect(port).not.toMatch(/from\s+['"]three/);
    expect(port).toMatch(/MISSION_PHOTO_PRESENTATION_WIDTH = 1280/);
    expect(port).toMatch(/MISSION_PHOTO_PRESENTATION_HEIGHT = 720/);
  });

  it('presentation frame capture is a one-shot offscreen render that restores and disposes', () => {
    const renderer = readFileSync(
      join(ROOT, 'src/app/core/rendering/services/three-renderer.service.ts'),
      'utf8',
    );
    const body = methodBody(
      renderer,
      'async captureMissionPresentationFrame(',
      '): Promise<Blob | null> {',
    );

    // Driven by the supplied authoritative camera snapshot, not the live camera.
    expect(body).toMatch(/new PerspectiveCamera\(/);
    expect(body).toMatch(/worldPose\.position/);
    expect(body).toMatch(/worldPose\.orientation/);

    // No animation frame is scheduled and the live camera is never mutated.
    expect(body).not.toMatch(/requestAnimationFrame/);
    expect(body).not.toMatch(/this\.camera/);

    // Render target and drone visibility are restored, and the target disposed.
    expect(body).toMatch(/setRenderTarget\(previousTarget\)/);
    expect(body).toMatch(/target\.dispose\(\)/);
    expect(body).toMatch(/this\.drone\.visible = droneWasVisible/);
  });
});
