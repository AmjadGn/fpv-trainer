import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dependency-boundary guard for Checkpoint 3:
 * pure packages must not import Angular / Three / Rapier / src/app.
 * Mission feature components must not import Rapier or score photography.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
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

describe('Checkpoint 3 dependency boundaries', () => {
  it('pure packages do not import Angular, Three.js, Rapier, or src/app', () => {
    const packagesDir = join(ROOT, 'packages');
    const files = walk(packagesDir);
    const forbidden = [
      /from\s+['"]@angular\//,
      /from\s+['"]three/,
      /from\s+['"]@dimforge\/rapier/,
      /from\s+['"].*src\/app/,
    ];
    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const re of forbidden) {
        if (re.test(text)) {
          violations.push(`${file} matched ${re}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('mission feature components do not import Rapier or photography scoring', () => {
    const missionsDir = join(ROOT, 'src/app/features/missions');
    const files = walk(missionsDir);
    const forbidden = [
      /from\s+['"]@dimforge\/rapier/,
      /evaluatePhotoCapture/,
      /createPhotoCaptureEvidence/,
    ];
    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const re of forbidden) {
        if (re.test(text)) {
          violations.push(`${file} matched ${re}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('flight controller does not import mission-domain', () => {
    const file = join(
      ROOT,
      'src/app/core/flight/services/flight-controller.service.ts',
    );
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/@fpv\/mission-domain/);
  });
});
