import type { CompiledAircraftSpecification } from '../outputs/specification';
import type {
  BuildFingerprint,
  CompilationContextFingerprint,
  RuntimeCompatibilitySignature,
} from '@fpv/engineering-kernel';

/**
 * Combined compilation cache (v1.1.1).
 *
 * Key includes BuildFingerprint + CompilationContextFingerprint +
 * RuntimeCompatibilitySignature so policy changes and runtime-adapter changes
 * cannot cross-contaminate. Physical-only / eligibility / runtime split caches
 * remain a future refinement (ADR-015); the combined key is safe.
 */
export interface CompilationCache {
  get(
    buildFingerprint: BuildFingerprint,
    compilationContextFingerprint: CompilationContextFingerprint,
    runtimeCompatibilitySignature: RuntimeCompatibilitySignature,
    engineeringModelVersion: string,
    compilerVersion: string,
  ): CompiledAircraftSpecification | undefined;
  set(
    buildFingerprint: BuildFingerprint,
    compilationContextFingerprint: CompilationContextFingerprint,
    runtimeCompatibilitySignature: RuntimeCompatibilitySignature,
    engineeringModelVersion: string,
    compilerVersion: string,
    spec: CompiledAircraftSpecification,
  ): void;
  clear(): void;
}

function cacheKey(
  buildFingerprint: string,
  compilationContextFingerprint: string,
  runtimeCompatibilitySignature: string,
  engineeringModelVersion: string,
  compilerVersion: string,
): string {
  return `${buildFingerprint}|${compilationContextFingerprint}|${runtimeCompatibilitySignature}|${engineeringModelVersion}|${compilerVersion}`;
}

export function createMemoryCompilationCache(): CompilationCache {
  const store = new Map<string, CompiledAircraftSpecification>();
  return {
    get(bf, ctx, runtime, eng, comp) {
      return store.get(cacheKey(bf, ctx, runtime, eng, comp));
    },
    set(bf, ctx, runtime, eng, comp, spec) {
      store.set(cacheKey(bf, ctx, runtime, eng, comp), spec);
    },
    clear() {
      store.clear();
    },
  };
}
