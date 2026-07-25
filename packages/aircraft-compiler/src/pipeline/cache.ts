import type { CompiledAircraftSpecification } from '../outputs/specification';
import type { BuildFingerprint } from '@fpv/engineering-kernel';

export interface CompilationCache {
  get(
    buildFingerprint: BuildFingerprint,
    engineeringModelVersion: string,
    compilerVersion: string,
  ): CompiledAircraftSpecification | undefined;
  set(
    buildFingerprint: BuildFingerprint,
    engineeringModelVersion: string,
    compilerVersion: string,
    spec: CompiledAircraftSpecification,
  ): void;
  clear(): void;
}

function cacheKey(
  buildFingerprint: string,
  engineeringModelVersion: string,
  compilerVersion: string,
): string {
  return `${buildFingerprint}|${engineeringModelVersion}|${compilerVersion}`;
}

export function createMemoryCompilationCache(): CompilationCache {
  const store = new Map<string, CompiledAircraftSpecification>();
  return {
    get(bf, eng, comp) {
      return store.get(cacheKey(bf, eng, comp));
    },
    set(bf, eng, comp, spec) {
      store.set(cacheKey(bf, eng, comp), spec);
    },
    clear() {
      store.clear();
    },
  };
}
