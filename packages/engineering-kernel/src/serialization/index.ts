import { quantize } from '../math/index';

/**
 * Canonical JSON serialization for deterministic fingerprints.
 * - Sorted object keys
 * - Stable array order (caller must pre-sort semantic arrays)
 * - Quantized floats
 * - No undefined
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function canonicalizeValue(value: unknown): JsonValue {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite number in canonical serialization: ${value}`);
    }
    return quantize(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => canonicalizeValue(v));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, JsonValue> = {};
    for (const key of keys) {
      const v = obj[key];
      if (v === undefined) {
        continue;
      }
      out[key] = canonicalizeValue(v);
    }
    return out;
  }
  throw new Error(`Unsupported type in canonical serialization: ${typeof value}`);
}

export function canonicalize(value: unknown): JsonValue {
  return canonicalizeValue(value);
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** FNV-1a 64-bit style hash as hex string (deterministic, no crypto dependency). */
export function hashCanonical(value: unknown): string {
  const input = canonicalStringify(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x01000193) ^ (h1 >>> 16);
  }
  const a = (h1 >>> 0).toString(16).padStart(8, '0');
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${a}${b}`;
}
