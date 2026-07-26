import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { CuratedLocationRegistry } from './curated-location-registry';
import { BundledLocationDefinitionSource } from './bundled-location-definition-source';
import {
  MEDITERRANEAN_LOCATION_ID,
  MEDITERRANEAN_PACKAGE_VERSION,
} from '../../../content/locations/mediterranean-expedition-region';

describe('CuratedLocationRegistry / BundledLocationDefinitionSource', () => {
  let registry: CuratedLocationRegistry;
  let source: BundledLocationDefinitionSource;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CuratedLocationRegistry, BundledLocationDefinitionSource],
    });
    registry = TestBed.inject(CuratedLocationRegistry);
    source = TestBed.inject(BundledLocationDefinitionSource);
  });

  it('lists installed Mediterranean package', async () => {
    const listed = registry.list();
    expect(listed.some((r) => r.locationId === MEDITERRANEAN_LOCATION_ID)).toBe(true);
    const summaries = await source.listInstalled();
    expect(summaries.some((s) => s.locationId === MEDITERRANEAN_LOCATION_ID)).toBe(true);
  });

  it('resolves exact id lookup', async () => {
    const summary = await source.lookupDefinition(MEDITERRANEAN_LOCATION_ID);
    expect(summary?.available).toBe(true);
    expect(summary?.version).toBe(MEDITERRANEAN_PACKAGE_VERSION);
    const def = await source.getDefinition(MEDITERRANEAN_LOCATION_ID);
    expect(def).not.toBeNull();
  });

  it('returns null for unavailable package', async () => {
    expect(await source.lookupDefinition('does-not-exist')).toBeNull();
  });

  it('marks unsupported version unavailable', async () => {
    const summary = await source.lookupDefinition(MEDITERRANEAN_LOCATION_ID, '9.9.9');
    expect(summary?.available).toBe(false);
  });

  it('rejects duplicate registration and fallback-flat', () => {
    expect(() =>
      registry.register({
        locationId: MEDITERRANEAN_LOCATION_ID,
        packageVersion: '1.0.0',
        displayName: 'dup',
        primarySubregionId: 'x',
        definition: registry.get(MEDITERRANEAN_LOCATION_ID)!.definition,
        provenanceRecordIds: [],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      registry.register({
        locationId: 'fallback-flat',
        packageVersion: '1.0.0',
        displayName: 'flat',
        primarySubregionId: 'x',
        definition: registry.get(MEDITERRANEAN_LOCATION_ID)!.definition,
        provenanceRecordIds: [],
      }),
    ).toThrow(/fallback-flat/);
  });
});
