import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompetitiveCacheService } from './competitive-cache.service';

describe('CompetitiveCacheService', () => {
  const memory = new Map<string, string>();
  let store: Storage;

  beforeEach(() => {
    memory.clear();
    store = {
      get length() {
        return memory.size;
      },
      clear: () => memory.clear(),
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, String(value));
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
      key: (index: number) => [...memory.keys()][index] ?? null,
    };
    vi.stubGlobal('localStorage', store);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns expired entries when stale cache is allowed', () => {
    const service = new CompetitiveCacheService();
    service.set('season', { id: 's1' }, -1);

    expect(service.get('season')).toBeNull();
    expect(service.get<{ id: string }>('season', true)).toMatchObject({ value: { id: 's1' }, stale: true });
  });

  it('clears only competitive cache entries', () => {
    const service = new CompetitiveCacheService();
    service.set('flags', {});
    localStorage.setItem('fpv.settings', 'keep');

    service.clear();

    expect(service.get('flags', true)).toBeNull();
    expect(localStorage.getItem('fpv.settings')).toBe('keep');
  });
});
