/**
 * Versioned local persistence helpers.
 * Tiny preferences → localStorage; larger structured data can move to IndexedDB later.
 */

export interface LocalStoreMeta {
  version: number;
  migratedFrom?: number;
}

export function readVersionedJson<T extends LocalStoreMeta>(
  key: string,
  currentVersion: number,
  migrate: (raw: unknown, fromVersion: number) => T,
  fallback: T,
): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<T> & { version?: number };
    const from = typeof parsed.version === 'number' ? parsed.version : 0;
    if (from === currentVersion) {
      return { ...fallback, ...parsed, version: currentVersion };
    }
    return migrate(parsed, from);
  } catch {
    return fallback;
  }
}

export function writeVersionedJson(key: string, value: LocalStoreMeta): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — callers should tolerate loss */
  }
}

export async function clearLocalProductData(options: {
  settings?: boolean;
  onboarding?: boolean;
  controllerProfiles?: boolean;
  replays?: boolean;
  feedbackDraft?: boolean;
  continueState?: boolean;
} = {}): Promise<string[]> {
  const cleared: string[] = [];
  const map: Record<string, string> = {
    settings: 'fpv-trainer.settings.v1',
    onboarding: 'fpv-trainer.onboarding.v1',
    controllerProfiles: 'fpv-trainer.controller-profiles.v1',
    feedbackDraft: 'fpv-trainer.feedback-draft.v1',
    continueState: 'fpv-trainer.continue.v1',
  };
  for (const [flag, key] of Object.entries(map)) {
    if ((options as Record<string, boolean | undefined>)[flag] !== false) {
      try {
        localStorage.removeItem(key);
        cleared.push(key);
      } catch {
        /* ignore */
      }
    }
  }
  if (options.replays !== false) {
    try {
      localStorage.removeItem('fpv-trainer.replay.latest.v1');
      cleared.push('fpv-trainer.replay.latest.v1');
    } catch {
      /* ignore */
    }
  }
  return cleared;
}
