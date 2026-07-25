/**
 * Thin wrapper around @dimforge/rapier3d-compat.
 * No CDN. No RAF. Initialization is async (WASM).
 */
import type RAPIER from '@dimforge/rapier3d-compat';

export type RapierModule = typeof RAPIER;

let rapierModule: RapierModule | null = null;
let initPromise: Promise<RapierModule> | null = null;
let initFailed = false;
let initError: string | null = null;

export function getRapierInitError(): string | null {
  return initError;
}

export function didRapierInitFail(): boolean {
  return initFailed;
}

export function getRapierModule(): RapierModule | null {
  return rapierModule;
}

/**
 * Initialize Rapier WASM once. Safe to call repeatedly.
 * On failure, returns null and sets initFailed — callers fall back to legacy ground.
 */
export async function initRapier(): Promise<RapierModule | null> {
  if (rapierModule) {
    return rapierModule;
  }
  if (initFailed) {
    return null;
  }
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const R = (await import('@dimforge/rapier3d-compat')).default;
        await R.init();
        rapierModule = R;
        return R;
      } catch (err) {
        initFailed = true;
        initError =
          err instanceof Error ? err.message : 'Rapier WASM initialization failed';
        initPromise = null;
        throw err;
      }
    })();
  }
  try {
    return await initPromise;
  } catch {
    return null;
  }
}

/** Test-only: reset module state between unit tests. */
export function __resetRapierAdapterForTests(): void {
  rapierModule = null;
  initPromise = null;
  initFailed = false;
  initError = null;
}
