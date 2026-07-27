import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

describe('Checkpoint 6 dependency boundaries', () => {
  it('mission-persistence package stays free of Angular, IndexedDB, Blob, and DOM APIs', () => {
    const files = walk(join(ROOT, 'packages/mission-persistence'));
    const violations = violationsIn(files, [
      /from\s+['"]@angular\//,
      /from\s+['"]three/,
      /from\s+['"]@dimforge\/rapier/,
      /from\s+['"].*src\/app/,
      /\bindexedDB\b/,
      /\bIDBDatabase\b/,
      /\bBlob\b/,
      /\bURL\.createObjectURL\b/,
      /\bdocument\b/,
      /\bwindow\b/,
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
    ]);
    expect(violations).toEqual([]);
  });

  it('mission runtime services do not open IndexedDB transactions', () => {
    const files = [
      ...walk(join(ROOT, 'src/app/core/mission/services')),
      ...walk(join(ROOT, 'src/app/core/mission/ports')),
    ];
    const violations = violationsIn(files, [
      /\bindexedDB\b/,
      /\bIDBDatabase\b/,
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
    ]);
    expect(violations).toEqual([]);
  });

  it('feature missions UI never imports IndexedDB directly', () => {
    const files = walk(join(ROOT, 'src/app/features/missions'));
    const violations = violationsIn(files, [
      /\bindexedDB\b/,
      /\bIDBDatabase\b/,
      /from\s+['"]@dimforge\/rapier/,
      /from\s+['"]three/,
    ]);
    expect(violations).toEqual([]);
  });

  it('adapters live outside pure package and use fpv-missions-v1', () => {
    const adapter = readFileSync(
      join(ROOT, 'src/app/core/mission-persistence/indexed-db-mission-persistence.adapter.ts'),
      'utf8',
    );
    expect(adapter).toMatch(/fpv-missions-v1/);
    expect(adapter).toMatch(/MISSIONS_IDB_VERSION = 1/);
  });
});
