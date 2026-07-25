import { recommendQualityPreset } from './quality-recommendation';

describe('recommendQualityPreset', () => {
  it('returns a conservative preset', () => {
    const rec = recommendQualityPreset(navigator, window);
    expect(['low', 'medium', 'high']).toContain(rec.preset);
    expect(rec.reason.length).toBeGreaterThan(0);
  });
});
