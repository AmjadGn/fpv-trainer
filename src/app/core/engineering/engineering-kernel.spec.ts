import { describe, expect, it } from 'vitest';

import {
  canonicalize,
  canonicalStringify,
  hashCanonical,
  quantize,
  kg,
  m,
  V1_1_VERSION_MANIFEST,
} from '@fpv/engineering-kernel';

describe('engineering-kernel', () => {
  it('quantizes floats deterministically', () => {
    expect(quantize(0.1 + 0.2)).toBe(quantize(0.3));
  });

  it('canonicalizes with sorted keys', () => {
    const a = canonicalStringify({ b: 1, a: 2 });
    const b = canonicalStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1}');
  });

  it('hashes identically for key-order differences', () => {
    expect(hashCanonical({ z: 1, a: [2, 3] })).toBe(
      hashCanonical({ a: [2, 3], z: 1 }),
    );
  });

  it('rejects non-finite numbers in canonicalize', () => {
    expect(() => canonicalize({ x: Number.NaN })).toThrow();
  });

  it('exposes SI helpers and version manifest', () => {
    expect(kg(1)).toBe(1);
    expect(m(2)).toBe(2);
    expect(V1_1_VERSION_MANIFEST.compilerVersion).toBe('1.1.1');
    expect(V1_1_VERSION_MANIFEST.engineeringModelVersion).toBe('1.1.1');
  });
});
