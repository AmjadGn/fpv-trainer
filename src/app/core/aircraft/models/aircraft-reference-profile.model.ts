/**
 * Engineering reference only — never shown as a selectable production aircraft.
 * Do not invent private manufacturer data; mark estimates clearly.
 */
export type ReferenceSourceType =
  | 'public-spec'
  | 'public-dimension'
  | 'category-estimate'
  | 'internal-tuning';

export type ReferenceConfidence = 'high' | 'medium' | 'low' | 'estimated';

export interface ReferencePublicDimensions {
  widthMm?: number;
  lengthMm?: number;
  heightMm?: number;
  propellerDiameterInches?: number;
  notes?: string;
}

export interface ReferenceAircraftProfile {
  referenceId: string;
  referenceManufacturer: string;
  referenceModel: string;
  sourceType: ReferenceSourceType;
  publicDimensions: ReferencePublicDimensions;
  publicWeightGrams?: number;
  publicTopSpeedKmh?: number;
  publiclyKnownCategory: string;
  publiclyKnownFlightModes: string[];
  documentedSources: string[];
  estimatedParameters: Record<string, number | string | boolean>;
  estimationNotes: string[];
  confidenceLevel: ReferenceConfidence;
  /** Always true for production builds — catalog must filter these out. */
  internalOnly: true;
  lastReviewedAt: string;
}
