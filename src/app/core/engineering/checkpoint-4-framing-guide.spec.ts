import { describe, expect, it } from 'vitest';
import { MISSION_CAPTURE_ASPECT_RATIO } from '@fpv/simulation-contracts';

/**
 * Framing-guide geometry helpers mirrored from MissionFramingGuideComponent
 * (presentation-only; no camera/scoring dependencies).
 */
function computeFrame(vw: number, vh: number): {
  width: number;
  height: number;
  left: number;
  top: number;
  horizontalBar: number;
  verticalBar: number;
} {
  const target = MISSION_CAPTURE_ASPECT_RATIO;
  const viewportAspect = vw / vh;
  let width: number;
  let height: number;
  if (viewportAspect > target) {
    height = vh;
    width = vh * target;
  } else {
    width = vw;
    height = vw / target;
  }
  return {
    width,
    height,
    left: (vw - width) / 2,
    top: (vh - height) / 2,
    horizontalBar: Math.max(0, (vw - width) / 2),
    verticalBar: Math.max(0, (vh - height) / 2),
  };
}

describe('Mission framing guide geometry', () => {
  it('fills a exact 16:9 viewport', () => {
    const f = computeFrame(1600, 900);
    expect(f.width).toBeCloseTo(1600);
    expect(f.height).toBeCloseTo(900);
    expect(f.horizontalBar).toBeCloseTo(0);
    expect(f.verticalBar).toBeCloseTo(0);
  });

  it('pillarboxes a wider viewport', () => {
    const f = computeFrame(2000, 900);
    expect(f.height).toBeCloseTo(900);
    expect(f.width).toBeCloseTo(900 * (16 / 9));
    expect(f.horizontalBar).toBeGreaterThan(0);
    expect(f.verticalBar).toBeCloseTo(0);
  });

  it('letterboxes a narrower viewport', () => {
    const f = computeFrame(900, 1200);
    expect(f.width).toBeCloseTo(900);
    expect(f.height).toBeCloseTo(900 / (16 / 9));
    expect(f.verticalBar).toBeGreaterThan(0);
    expect(f.horizontalBar).toBeCloseTo(0);
  });

  it('uses MISSION_CAPTURE_ASPECT_RATIO 16/9', () => {
    expect(MISSION_CAPTURE_ASPECT_RATIO).toBeCloseTo(16 / 9);
  });
});
