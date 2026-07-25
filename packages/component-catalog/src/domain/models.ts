import type {
  ComponentId,
  ComponentRevisionId,
  CatalogReleaseId,
  Kilograms,
  Meters,
  Volts,
  Amperes,
  AmpereHours,
  Ohms,
  Watts,
  Vec3Si,
} from '@fpv/engineering-kernel';

export type ComponentType =
  | 'frame'
  | 'motor'
  | 'propeller'
  | 'esc'
  | 'battery'
  | 'flight-controller'
  | 'camera'
  | 'video-transmitter'
  | 'receiver'
  | 'antenna'
  | 'gps-module'
  | 'payload'
  | 'protective-accessory'
  | 'cosmetic';

export type ComponentSource =
  | 'official'
  | 'community'
  | 'marketplace'
  | 'private-local';

export type DataProvenance =
  | 'measured'
  | 'manufacturer-like-reference'
  | 'estimated'
  | 'derived'
  | 'curated'
  | 'community-supplied';

export type DataConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type ReleaseStatus =
  | 'draft'
  | 'published'
  | 'deprecated'
  | 'archived';

export interface DisplayMetadata {
  readonly displayName: string;
  readonly description: string;
  readonly manufacturerLabel: string;
  readonly categoryLabels: readonly string[];
  readonly thumbnailKey: string | null;
  readonly tags: readonly string[];
}

export interface PhysicalDimensions {
  readonly widthMeters: Meters;
  readonly lengthMeters: Meters;
  readonly heightMeters: Meters;
}

export interface EngineeringDataQuality {
  readonly provenance: DataProvenance;
  readonly confidence: DataConfidence;
}

export interface ComponentRevisionBase {
  readonly componentId: ComponentId;
  readonly revisionId: ComponentRevisionId;
  readonly componentType: ComponentType;
  readonly source: ComponentSource;
  readonly releaseStatus: ReleaseStatus;
  readonly display: DisplayMetadata;
  readonly massKg: Kilograms;
  readonly dimensions: PhysicalDimensions;
  readonly localCenterOfMass: Vec3Si;
  readonly mountingPatterns: readonly string[];
  readonly compatibilityTags: readonly string[];
  readonly dataQuality: EngineeringDataQuality;
  readonly schemaVersion: string;
}

export interface FrameSpec {
  readonly wheelbaseMeters: Meters;
  readonly armPositions: readonly Vec3Si[];
  readonly motorMountPattern: string;
  readonly supportedPropDiameterMinM: Meters;
  readonly supportedPropDiameterMaxM: Meters;
  readonly batteryMountZone: PhysicalDimensions;
  readonly maxRecommendedTakeoffMassKg: Kilograms;
  readonly dragProfileFactor: number;
  readonly frameInertiaFactor: number;
}

export interface MotorSpec {
  readonly statorWidthMm: number;
  readonly statorHeightMm: number;
  readonly kv: number;
  readonly voltageMin: Volts;
  readonly voltageMax: Volts;
  readonly maxContinuousCurrentA: Amperes;
  readonly maxContinuousPowerW: Watts;
  readonly internalResistanceOhm: Ohms;
  readonly propellerDiameterMinM: Meters;
  readonly propellerDiameterMaxM: Meters;
  readonly responseTimeConstantS: number;
  readonly peakThrustHintNewtons: number;
}

export interface PropellerSpec {
  readonly diameterMeters: Meters;
  readonly pitchMeters: Meters;
  readonly bladeCount: number;
  readonly rotationalInertiaFactor: number;
  readonly recommendedRpmMin: number;
  readonly recommendedRpmMax: number;
  readonly thrustCoefficient: number;
  readonly powerCoefficient: number;
  readonly rotationDirections: readonly ('cw' | 'ccw' | 'either')[];
}

export interface BatterySpec {
  readonly cellCount: number;
  readonly nominalVoltage: Volts;
  readonly maxVoltage: Volts;
  readonly capacityAh: AmpereHours;
  readonly dischargeCRating: number;
  readonly internalResistanceOhm: Ohms;
  readonly connectorType: string;
  readonly voltageSagFactor: number;
}

export interface EscSpec {
  readonly voltageMin: Volts;
  readonly voltageMax: Volts;
  readonly continuousCurrentA: Amperes;
  readonly burstCurrentA: Amperes;
  readonly protocols: readonly string[];
  readonly efficiency: number;
  readonly topology: 'individual' | '4in1';
}

export interface ElectronicsSpec {
  readonly powerDrawWatts: Watts;
  readonly dragContribution: number;
}

export type ComponentEngineeringSpec =
  | { readonly type: 'frame'; readonly frame: FrameSpec }
  | { readonly type: 'motor'; readonly motor: MotorSpec }
  | { readonly type: 'propeller'; readonly propeller: PropellerSpec }
  | { readonly type: 'esc'; readonly esc: EscSpec }
  | { readonly type: 'battery'; readonly battery: BatterySpec }
  | { readonly type: 'flight-controller'; readonly electronics: ElectronicsSpec }
  | { readonly type: 'camera'; readonly electronics: ElectronicsSpec }
  | { readonly type: 'video-transmitter'; readonly electronics: ElectronicsSpec }
  | { readonly type: 'receiver'; readonly electronics: ElectronicsSpec }
  | { readonly type: 'antenna'; readonly electronics: ElectronicsSpec }
  | { readonly type: 'gps-module'; readonly electronics: ElectronicsSpec }
  | { readonly type: 'payload'; readonly electronics: ElectronicsSpec }
  | { readonly type: 'protective-accessory'; readonly electronics: ElectronicsSpec }
  | { readonly type: 'cosmetic'; readonly electronics: ElectronicsSpec };

export interface ComponentRevision extends ComponentRevisionBase {
  readonly engineering: ComponentEngineeringSpec;
}

export interface CatalogRelease {
  readonly releaseId: CatalogReleaseId;
  readonly version: string;
  readonly componentRevisionIds: readonly ComponentRevisionId[];
  readonly publishedAtIso: string | null;
  readonly label: string;
}

export interface ComponentCatalogSnapshot {
  readonly release: CatalogRelease;
  readonly revisions: ReadonlyMap<ComponentRevisionId, ComponentRevision>;
}
