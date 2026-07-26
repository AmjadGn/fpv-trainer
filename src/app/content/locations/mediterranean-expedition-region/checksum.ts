/**
 * Deterministic non-cryptographic content digests for procedural asset descriptors.
 * Production GLTF packages would use real sha256 of bytes; proxy descriptors use
 * a stable hex digest of the authored identity string.
 */

export function proceduralSha256Hex(seed: string): string {
  let h0 = 0x811c9dc5 >>> 0;
  let h1 = 0x01000193 >>> 0;
  let h2 = 0xdeadbeef >>> 0;
  let h3 = 0x41414141 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h0 = Math.imul(h0 ^ c, 0x01000193) >>> 0;
    h1 = Math.imul(h1 ^ (c << 1), 0x85ebca6b) >>> 0;
    h2 = Math.imul(h2 ^ (c << 2), 0xc2b2ae35) >>> 0;
    h3 = Math.imul(h3 ^ (c << 3), 0x27d4eb2d) >>> 0;
  }
  const parts = [
    h0,
    h1,
    h2,
    h3,
    (h0 ^ h2) >>> 0,
    (h1 ^ h3) >>> 0,
    (~h0) >>> 0,
    (~h1) >>> 0,
  ];
  return parts.map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('').slice(0, 64);
}
