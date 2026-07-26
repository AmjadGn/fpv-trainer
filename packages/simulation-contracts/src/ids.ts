/**
 * Generic branding helper, mirroring the pattern used in
 * `@fpv/engineering-kernel`'s identifiers module. Specific identifier types
 * (e.g. entity ids, session ids) belong in the domain packages that own
 * them — this module only exports the reusable brand primitive plus the
 * numeric brands needed by other contracts modules in this package
 * (time.ts).
 */

declare const Brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [Brand]: B };

/** Brands an arbitrary string value with a nominal tag `B`. */
export function brand<B extends string>(value: string): Brand<string, B> {
  return value as Brand<string, B>;
}

/** Brands an arbitrary numeric value with a nominal tag `B`. */
export function brandNumber<B extends string>(value: number): Brand<number, B> {
  return value as Brand<number, B>;
}
