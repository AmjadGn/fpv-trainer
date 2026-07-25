import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  /from ['"]@angular\//,
  /from ['"]three['"]/,
  /from ['"]three\//,
  /from ['"]@dimforge\/rapier3d-compat['"]/,
];

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p, files);
    } else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) {
      files.push(p);
    }
  }
  return files;
}

describe('package import boundaries', () => {
  it('engineering packages do not import Angular, Three, or Rapier', () => {
    const root = join(process.cwd(), 'packages');
    const packages = [
      'engineering-kernel',
      'component-catalog',
      'drone-build-domain',
      'compatibility-engine',
      'aircraft-engineering',
      'aircraft-compiler',
      'aircraft-runtime-adapter',
      'drone-build-persistence',
      'factory-aircraft',
      'engineering-testing',
    ];
    const violations: string[] = [];
    for (const pkg of packages) {
      const dir = join(root, pkg, 'src');
      for (const file of walk(dir)) {
        const src = readFileSync(file, 'utf8');
        for (const re of FORBIDDEN) {
          if (re.test(src)) {
            violations.push(`${file} matches ${re}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
