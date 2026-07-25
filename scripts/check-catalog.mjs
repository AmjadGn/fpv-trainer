import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'manifest.json',
  'environments.json',
  'courses.json',
  'weather-presets.json',
  'achievements.json',
  'challenge-rotation.json',
];
let failed = false;
for (const file of files) {
  const shared = readFileSync(resolve(root, 'shared/catalog', file), 'utf8');
  const pub = readFileSync(resolve(root, 'public/catalog', file), 'utf8');
  if (shared !== pub) {
    console.error(`Catalog mismatch: ${file}`);
    failed = true;
  }
}
if (failed) {
  process.exit(1);
}
console.log('Catalog assets match shared/catalog.');
