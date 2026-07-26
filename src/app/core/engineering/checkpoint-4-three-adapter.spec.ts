import { describe, expect, it } from 'vitest';

import { ThreeCuratedLocationSceneAdapter } from '../mission/adapters/three-curated-location-scene.adapter';
import { COASTAL_RUINS_AUTHORED_SEED } from '../../content/locations/mediterranean-expedition-region';

describe('ThreeCuratedLocationSceneAdapter', () => {
  it('builds deterministic proxy layout with expected landmarks', () => {
    const adapter = new ThreeCuratedLocationSceneAdapter();
    const a = adapter.build('medium');
    expect(a.diagnostics.authoredSeed).toBe(COASTAL_RUINS_AUTHORED_SEED);
    expect(a.landmarkGroupNames).toContain('landmark-stone-sea-arch');
    expect(a.landmarkGroupNames).toContain('landmark-ruined-lookout');
    expect(a.landmarkGroupNames).toContain('landmark-cliffside-ruin');
    expect(a.diagnostics.visualObjectCount).toBeGreaterThan(10);
    adapter.dispose(a);
    expect(adapter.getActiveRoot()).toBeNull();
  });

  it('changes decorative density by quality tier only', () => {
    const adapter = new ThreeCuratedLocationSceneAdapter();
    const low = adapter.build('low');
    const lowCount = low.diagnostics.visualObjectCount;
    adapter.dispose(low);
    const high = adapter.build('high');
    expect(high.diagnostics.visualObjectCount).toBeGreaterThan(lowCount);
    expect(high.landmarkGroupNames).toEqual(low.landmarkGroupNames);
    adapter.dispose(high);
  });

  it('disposes geometry and materials without retaining scene group', () => {
    const adapter = new ThreeCuratedLocationSceneAdapter();
    const handle = adapter.build('low');
    expect(handle.diagnostics.geometryCount).toBeGreaterThan(0);
    expect(handle.diagnostics.materialCount).toBeGreaterThan(0);
    adapter.dispose(handle);
    expect(adapter.getActiveRoot()).toBeNull();
  });
});
