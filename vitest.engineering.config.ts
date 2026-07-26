import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const root = resolve(__dirname);

/**
 * Engineering-domain Vitest config.
 * Angular's unit-test builder only discovers specs under src/; this config
 * runs package specs and src/app/core/engineering specs together.
 */
export default defineConfig({
  root,
  test: {
    name: 'engineering',
    environment: 'jsdom',
    globals: false,
    include: [
      'packages/**/*.spec.ts',
      'src/app/core/engineering/**/*.spec.ts',
    ],
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@fpv/engineering-kernel': resolve(root, 'packages/engineering-kernel/src/index.ts'),
      '@fpv/component-catalog': resolve(root, 'packages/component-catalog/src/index.ts'),
      '@fpv/drone-build-domain': resolve(root, 'packages/drone-build-domain/src/index.ts'),
      '@fpv/compatibility-engine': resolve(root, 'packages/compatibility-engine/src/index.ts'),
      '@fpv/aircraft-engineering': resolve(root, 'packages/aircraft-engineering/src/index.ts'),
      '@fpv/propulsion-data': resolve(root, 'packages/propulsion-data/src/index.ts'),
      '@fpv/aircraft-compiler': resolve(root, 'packages/aircraft-compiler/src/index.ts'),
      '@fpv/aircraft-runtime-adapter': resolve(
        root,
        'packages/aircraft-runtime-adapter/src/index.ts',
      ),
      '@fpv/drone-build-persistence': resolve(
        root,
        'packages/drone-build-persistence/src/index.ts',
      ),
      '@fpv/factory-aircraft': resolve(root, 'packages/factory-aircraft/src/index.ts'),
      '@fpv/engineering-testing': resolve(root, 'packages/engineering-testing/src/index.ts'),
      '@fpv/simulation-contracts': resolve(root, 'packages/simulation-contracts/src/index.ts'),
      '@fpv/location-domain': resolve(root, 'packages/location-domain/src/index.ts'),
      '@fpv/mission-domain': resolve(root, 'packages/mission-domain/src/index.ts'),
      '@fpv/photography-domain': resolve(root, 'packages/photography-domain/src/index.ts'),
      '@fpv/location-validation': resolve(root, 'packages/location-validation/src/index.ts'),
    },
  },
});
