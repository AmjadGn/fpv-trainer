export type GraphicsQualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

export interface QualityRecommendation {
  preset: Exclude<GraphicsQualityPreset, 'custom' | 'ultra'>;
  reason: string;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  isMobile: boolean;
}

/**
 * Conservative auto-quality detection. Never changes flight physics.
 */
export function recommendQualityPreset(
  nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined,
): QualityRecommendation {
  const deviceMemoryGb =
    nav && 'deviceMemory' in nav
      ? Number((nav as Navigator & { deviceMemory?: number }).deviceMemory ?? null)
      : null;
  const hardwareConcurrency = nav?.hardwareConcurrency ?? null;
  const isMobile = !!win && win.matchMedia?.('(max-width: 768px)').matches;

  if (isMobile || (deviceMemoryGb != null && deviceMemoryGb <= 4)) {
    return {
      preset: 'low',
      reason: 'Low device memory or mobile form factor',
      deviceMemoryGb,
      hardwareConcurrency,
      isMobile,
    };
  }
  if ((deviceMemoryGb != null && deviceMemoryGb <= 8) || (hardwareConcurrency != null && hardwareConcurrency <= 4)) {
    return {
      preset: 'medium',
      reason: 'Moderate device capability',
      deviceMemoryGb,
      hardwareConcurrency,
      isMobile,
    };
  }
  return {
    preset: 'high',
    reason: 'Capable desktop-class device',
    deviceMemoryGb,
    hardwareConcurrency,
    isMobile,
  };
}
