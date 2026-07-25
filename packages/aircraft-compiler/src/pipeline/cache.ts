import type { CompiledAircraftSpecification } from '../outputs/specification';
import type {
  BuildFingerprint,
  CompilationContextFingerprint,
} from '@fpv/engineering-kernel';

export interface CompilationCache {
  get(
    buildFingerprint: BuildFingerprint,
    compilationContextFingerprint: CompilationContextFingerprint,
    engineeringModelVersion: string,
    compilerVersion: string,
  ): CompiledAircraftSpecification | undefined;
  set(
    buildFingerprint: BuildFingerprint,
    compilationContextFingerprint: CompilationContextFingerprint,
    engineeringModelVersion: string,
    compilerVersion: string,
    spec: CompiledAircraftSpecification,
  ): void;
  clear(): void;
}

function cacheKey(
  buildFingerprint: string,
  compilationContextFingerprint: string,
  engineeringModelVersion: string,
  compilerVersion: string,
): string {
  return `${buildFingerprint}|${compilationContextFingerprint}|${engineeringModelVersion}|${compilerVersion}`;
}

export function createMemoryCompilationCache(): CompilationCache {
  const store = new Map<string, CompiledAircraftSpecification>();
  return {
    get(bf, ctx, eng, comp) {
      return store.get(cacheKey(bf, ctx, eng, comp));
    },
    set(bf, ctx, eng, comp, spec) {
      store.set(cacheKey(bf, ctx, eng, comp), spec);
    },
    clear() {
      store.clear();
    },
  };
}
