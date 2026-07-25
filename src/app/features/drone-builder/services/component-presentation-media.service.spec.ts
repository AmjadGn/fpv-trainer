import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildOfficialCatalogSnapshot } from '@fpv/component-catalog';
import {
  materializeFactoryRevision,
  getFactoryManifest,
} from '@fpv/factory-aircraft';
import {
  compileAircraft,
  fingerprintBuildInput,
  normalizeBuildRevision,
} from '@fpv/aircraft-compiler';
import { FREE_FLIGHT_POLICY } from '@fpv/compatibility-engine';

import { COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID } from '../models/component-presentation-media.registry';
import { CATEGORY_FALLBACK_ASSET_PATHS } from '../models/component-presentation-media.registry';
import { BuilderPresentationMapperService } from './builder-presentation-mapper.service';
import { ComponentPresentationMediaService } from './component-presentation-media.service';
import { DroneBuilderFacadeService } from './drone-builder-facade.service';
import { DroneBuilderSessionService } from './drone-builder-session.service';
import { AircraftCatalogService } from '../../../core/aircraft/services/aircraft-catalog.service';
import {
  AIRCRAFT_PREFS_STORAGE_KEY,
  AircraftPersistenceService,
} from '../../../core/aircraft/services/aircraft-persistence.service';
import { SelectedAircraftService } from '../../../core/aircraft/services/selected-aircraft.service';
import { AppShellService } from '../../../core/shell/app-shell.service';

describe('ComponentPresentationMediaService (CP2.5)', () => {
  let media: ComponentPresentationMediaService;
  let mapper: BuilderPresentationMapperService;
  let facade: DroneBuilderFacadeService;
  let session: DroneBuilderSessionService;

  beforeEach(() => {
    try {
      localStorage.removeItem(AIRCRAFT_PREFS_STORAGE_KEY);
    } catch {
      /* jsdom */
    }

    TestBed.configureTestingModule({
      providers: [
        ComponentPresentationMediaService,
        BuilderPresentationMapperService,
        DroneBuilderFacadeService,
        DroneBuilderSessionService,
        AircraftCatalogService,
        AircraftPersistenceService,
        SelectedAircraftService,
        AppShellService,
      ],
    });

    media = TestBed.inject(ComponentPresentationMediaService);
    mapper = TestBed.inject(BuilderPresentationMapperService);
    facade = TestBed.inject(DroneBuilderFacadeService);
    session = TestBed.inject(DroneBuilderSessionService);
  });

  it('maps a known component to its intended media entry', () => {
    const resolved = media.resolve('frame-racing-5in@1', 'frame', 'Racing 5in');
    const entry = COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID['frame-racing-5in@1'];
    expect(entry).toBeTruthy();
    expect(resolved.thumbnailUrl).toBe(entry.thumbnailAssetPath);
    expect(resolved.imageUrl).toBe(entry.imageAssetPath);
    expect(resolved.isFallback).toBe(false);
    expect(resolved.thumbnailUrl).toContain('/assets/components/illustrations/');
    expect(resolved.thumbnailUrl.startsWith('http')).toBe(false);
    expect(resolved.altText.toLowerCase()).toContain('racing');
  });

  it('maps missing media to the correct category fallback', () => {
    const resolved = media.resolve(
      'motor-does-not-exist@9',
      'motor',
      'Ghost Motor',
    );
    expect(resolved.isFallback).toBe(true);
    expect(resolved.thumbnailUrl).toBe(CATEGORY_FALLBACK_ASSET_PATHS.motor);
    expect(resolved.altText.toLowerCase()).toContain('generic');
    expect(resolved.thumbnailUrl.startsWith('http')).toBe(false);
  });

  it('uses the same media registry for Simple and Advanced mapped options', async () => {
    await facade.bootstrap();
    facade.startFromIntent('racing');
    facade.setMode('simple');
    facade.setActiveCategory('frame');
    const simple = facade.mappedOptionsForActiveCategory();
    facade.setMode('advanced');
    const advanced = facade.mappedOptionsForActiveCategory();
    expect(simple.length).toBeGreaterThan(0);
    expect(advanced.map((o) => o.media.thumbnailUrl)).toEqual(
      simple.map((o) => o.media.thumbnailUrl),
    );
    expect(advanced.map((o) => o.media.altText)).toEqual(
      simple.map((o) => o.media.altText),
    );
  });

  it('does not require remote HTTP image URLs', () => {
    for (const entry of Object.values(COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID)) {
      expect(entry.thumbnailAssetPath.startsWith('/assets/')).toBe(true);
      expect(entry.imageAssetPath.startsWith('/assets/')).toBe(true);
      expect(entry.thumbnailAssetPath.startsWith('http')).toBe(false);
      expect(entry.imageAssetPath.startsWith('http')).toBe(false);
    }
    for (const path of Object.values(CATEGORY_FALLBACK_ASSET_PATHS)) {
      expect(path.startsWith('/assets/')).toBe(true);
      expect(path.startsWith('http')).toBe(false);
    }
  });

  it('broken or unavailable media does not prevent selection or compilation', async () => {
    await facade.bootstrap();
    facade.startFromIntent('freestyle');
    facade.setActiveCategory('motor');
    const options = facade.mappedOptionsForActiveCategory();
    expect(options.every((o) => !!o.media.thumbnailUrl)).toBe(true);

    const img = document.createElement('img');
    img.src = '/assets/components/missing-on-purpose.svg';
    media.onImageError({ target: img } as unknown as Event, 'motor');
    expect(img.getAttribute('data-fallback')).toBe('1');
    expect(img.src).toContain(CATEGORY_FALLBACK_ASSET_PATHS.motor);

    facade.compile();
    expect(session.phase()).toBe('compiled');
    expect(session.lastCompile()?.ok).toBe(true);
  });

  it('media changes do not change engineering or compilation fingerprints', () => {
    const catalog = buildOfficialCatalogSnapshot();
    const manifest = getFactoryManifest('apex-r5');
    expect(manifest).toBeTruthy();
    const revision = materializeFactoryRevision(manifest!);
    const normalized = normalizeBuildRevision(revision);
    const buildFp = fingerprintBuildInput(normalized);
    const compiled = compileAircraft(revision, [...catalog.revisions.values()], {
      policy: FREE_FLIGHT_POLICY,
    });
    expect(compiled.ok).toBe(true);

    // Resolve media for every selection — presentation-only side effects.
    for (const selection of revision.selections) {
      media.resolve(selection.componentRevisionId, 'frame');
    }
    // Registry lookup must never appear in engineering fingerprints.
    expect(fingerprintBuildInput(normalizeBuildRevision(revision))).toBe(buildFp);
    const compiledAgain = compileAircraft(revision, [...catalog.revisions.values()], {
      policy: FREE_FLIGHT_POLICY,
    });
    expect(compiledAgain.specification!.buildFingerprint).toBe(
      compiled.specification!.buildFingerprint,
    );
    expect(compiledAgain.specification!.artifactFingerprint).toBe(
      compiled.specification!.artifactFingerprint,
    );
    expect(JSON.stringify(revision)).not.toContain('/assets/components/');
    expect(JSON.stringify(compiled.specification)).not.toContain(
      '/assets/components/',
    );
  });

  it('exposes media through the presentation mapper for option cards', () => {
    const catalog = buildOfficialCatalogSnapshot();
    const revision = catalog.revisions.get(
      'motor-2306-2750kv@1' as never,
    );
    expect(revision).toBeTruthy();
    const option = mapper.mapComponentOption(revision!);
    expect(option.media.thumbnailUrl).toBe(
      CATEGORY_FALLBACK_ASSET_PATHS.motor,
    );
    expect(option.media.isFallback).toBe(true);
    expect(option.media.altText.toLowerCase()).toContain('motor');
  });
});
