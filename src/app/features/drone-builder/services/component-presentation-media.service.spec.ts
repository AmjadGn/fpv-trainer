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

import {
  CATEGORY_FALLBACK_ASSET_PATHS,
  COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID,
} from '../models/component-presentation-media.registry';
import { SIMPLE_STOCKED_CATEGORIES } from '../models/drone-builder-view.models';
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

describe('ComponentPresentationMediaService (product-distinct visuals)', () => {
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

  it('maps a known component to its product-specific media entry', () => {
    const resolved = media.resolve('frame-racing-5in@1', 'frame', 'Racing 5in');
    const entry = COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID['frame-racing-5in@1'];
    expect(entry).toBeTruthy();
    expect(resolved.thumbnailUrl).toBe(entry.thumbnailAssetPath);
    expect(resolved.imageUrl).toBe(entry.imageAssetPath);
    expect(resolved.isFallback).toBe(false);
    expect(resolved.thumbnailUrl).toContain('/assets/components/products/');
    expect(resolved.thumbnailUrl.startsWith('http')).toBe(false);
    expect(resolved.altText.toLowerCase()).toContain('racing');
  });

  it('requires every stocked catalog revision to have a media registry entry', () => {
    const catalog = buildOfficialCatalogSnapshot();
    for (const revision of catalog.revisions.values()) {
      if (!SIMPLE_STOCKED_CATEGORIES.includes(revision.componentType)) continue;
      const entry =
        COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID[revision.revisionId];
      expect(entry, `missing media for ${revision.revisionId}`).toBeTruthy();
      expect(entry.componentRevisionId).toBe(revision.revisionId);
      expect(entry.usesCategoryFallback).toBe(false);
      expect(entry.thumbnailAssetPath).toContain('/assets/components/products/');
    }
  });

  it('requires every stocked motor to have a unique non-fallback product asset', () => {
    const catalog = buildOfficialCatalogSnapshot();
    const paths = new Set<string>();
    for (const revision of catalog.revisions.values()) {
      if (revision.componentType !== 'motor') continue;
      const entry =
        COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID[revision.revisionId];
      expect(entry).toBeTruthy();
      expect(entry.usesCategoryFallback).toBe(false);
      expect(entry.visual?.motorStatorClass).toBeTruthy();
      expect(paths.has(entry.thumbnailAssetPath)).toBe(false);
      paths.add(entry.thumbnailAssetPath);
    }
    expect(paths.size).toBeGreaterThanOrEqual(4);
  });

  it('requires every stocked propeller to have a unique non-fallback product asset', () => {
    const catalog = buildOfficialCatalogSnapshot();
    const paths = new Set<string>();
    for (const revision of catalog.revisions.values()) {
      if (revision.componentType !== 'propeller') continue;
      const entry =
        COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID[revision.revisionId];
      expect(entry).toBeTruthy();
      expect(entry.usesCategoryFallback).toBe(false);
      expect(entry.visual?.propellerBladeCount).toBeTruthy();
      expect(paths.has(entry.thumbnailAssetPath)).toBe(false);
      paths.add(entry.thumbnailAssetPath);
    }
    expect(paths.size).toBeGreaterThanOrEqual(4);
  });

  it('matches propeller blade-count and diameter-class metadata to the catalog', () => {
    const catalog = buildOfficialCatalogSnapshot();
    for (const revision of catalog.revisions.values()) {
      if (revision.componentType !== 'propeller') continue;
      if (revision.engineering.type !== 'propeller') continue;
      const entry =
        COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID[revision.revisionId];
      expect(entry.visual?.propellerBladeCount).toBe(
        revision.engineering.propeller.bladeCount,
      );
      const diaM = revision.engineering.propeller.diameterMeters;
      const diaClass = entry.visual?.propellerDiameterClass ?? '';
      if (diaM < 0.08) {
        expect(diaClass).toContain('mm');
      } else if (diaM < 0.13) {
        expect(['120mm', '5in']).toContain(diaClass);
      } else if (diaM < 0.14) {
        expect(diaClass).toBe('5in');
      } else if (diaM < 0.165) {
        expect(diaClass).toBe('6in');
      } else {
        expect(diaClass).toBe('7in');
      }
    }
  });

  it('matches motor visual stator class to catalog motor dimensions', () => {
    const catalog = buildOfficialCatalogSnapshot();
    for (const revision of catalog.revisions.values()) {
      if (revision.componentType !== 'motor') continue;
      if (revision.engineering.type !== 'motor') continue;
      const entry =
        COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID[revision.revisionId];
      const expected = `${revision.engineering.motor.statorWidthMm}${String(
        revision.engineering.motor.statorHeightMm,
      ).padStart(2, '0')}`;
      expect(entry.visual?.motorStatorClass).toBe(expected);
    }
  });

  it('fails when non-fallback product asset paths are duplicated', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const entry of Object.values(COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID)) {
      if (entry.usesCategoryFallback) continue;
      if (entry.visual?.intentionalSharedFallback) continue;
      const prior = seen.get(entry.thumbnailAssetPath);
      if (prior) {
        duplicates.push(`${prior} and ${entry.componentRevisionId}`);
      } else {
        seen.set(entry.thumbnailAssetPath, entry.componentRevisionId);
      }
      if (entry.imageAssetPath !== entry.thumbnailAssetPath) {
        const priorImage = seen.get(entry.imageAssetPath);
        if (priorImage && priorImage !== entry.componentRevisionId) {
          duplicates.push(`${priorImage} and ${entry.componentRevisionId} (image)`);
        } else {
          seen.set(entry.imageAssetPath, entry.componentRevisionId);
        }
      }
    }
    expect(duplicates).toEqual([]);
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

  it('uses the exact selected component asset in the category summary strip', async () => {
    await facade.bootstrap();
    facade.startFromIntent('racing');
    facade.setActiveCategory('motor');
    const motorId = 'motor-2306-2750kv@1';
    facade.selectComponentForActiveCategory(motorId);
    const progress = facade.categoryProgress();
    const motorCat = progress.find((c) => c.category === 'motor');
    expect(motorCat?.selectedRevisionId).toBe(motorId);
    const entry = COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID[motorId];
    expect(motorCat?.media?.thumbnailUrl).toBe(entry.thumbnailAssetPath);
    expect(motorCat?.media?.isFallback).toBe(false);
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

    for (const selection of revision.selections) {
      media.resolve(selection.componentRevisionId, 'frame');
    }
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

  it('exposes product-specific media and distinguishing labels on option cards', () => {
    const catalog = buildOfficialCatalogSnapshot();
    const revision = catalog.revisions.get(
      'motor-2306-2750kv@1' as never,
    );
    expect(revision).toBeTruthy();
    const option = mapper.mapComponentOption(revision!);
    expect(option.media.isFallback).toBe(false);
    expect(option.media.thumbnailUrl).toContain(
      '/assets/components/products/motors/motor-2306-2750kv.svg',
    );
    expect(option.distinguishingLabels.some((l) => l.includes('2306'))).toBe(
      true,
    );
    expect(option.distinguishingLabels.some((l) => /KV/i.test(l))).toBe(true);
  });
});
