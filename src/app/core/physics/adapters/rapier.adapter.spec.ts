import { afterEach, describe, expect, it } from 'vitest';

import {
  __resetRapierAdapterForTests,
  didRapierInitFail,
  getRapierInitError,
  getRapierModule,
} from './rapier.adapter';

describe('rapier adapter', () => {
  afterEach(() => {
    __resetRapierAdapterForTests();
  });

  it('getRapierModule is null before init', () => {
    expect(getRapierModule()).toBeNull();
    expect(didRapierInitFail()).toBe(false);
    expect(getRapierInitError()).toBeNull();
  });

  it('__resetRapierAdapterForTests clears module and failure flags', () => {
    __resetRapierAdapterForTests();
    expect(getRapierModule()).toBeNull();
    expect(didRapierInitFail()).toBe(false);
    expect(getRapierInitError()).toBeNull();
  });
});
