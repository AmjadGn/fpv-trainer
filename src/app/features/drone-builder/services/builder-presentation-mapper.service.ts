import { Injectable } from '@angular/core';
import type { ComponentRevision, ComponentType } from '@fpv/component-catalog';
import type {
  ValidationIssue,
  ValidationReport,
  ValidationSeverity,
} from '@fpv/compatibility-engine';
import type {
  CompiledAircraftSpecification,
  CompilationResult,
} from '@fpv/aircraft-compiler';
import type { PropulsionDataProvenance } from '@fpv/aircraft-engineering';

import type {
  BuilderCompatibilityIssueView,
  BuilderCompileResultView,
  BuilderComponentOptionView,
  BuilderEngineeringStatView,
  CompatibilityIssueClass,
  EngineeringStatConfidenceLabel,
  EngineeringStatSourceLabel,
} from '../models/drone-builder-view.models';

const CATEGORY_LABELS: Record<ComponentType, string> = {
  frame: 'Frame',
  motor: 'Motors',
  propeller: 'Propellers',
  esc: 'ESC',
  battery: 'Battery',
  'flight-controller': 'Flight Controller',
  camera: 'FPV Camera',
  'video-transmitter': 'VTX',
  receiver: 'Receiver',
  antenna: 'Antenna',
  'gps-module': 'GPS',
  payload: 'Payload / Action Camera',
  'protective-accessory': 'Protective Accessory',
  cosmetic: 'Cosmetic',
};

const ISSUE_TITLES: Record<string, string> = {
  RES_MISSING_COMPONENT: 'Missing component data',
  STRUCT_MISSING_FRAME: 'Frame required',
  STRUCT_MOTOR_COUNT: 'Motor count mismatch',
  ELEC_VOLTAGE_MISMATCH: 'Battery voltage mismatch',
  ELEC_ESC_CURRENT: 'ESC current headroom',
  MECH_PROP_CLEARANCE: 'Propeller clearance',
  MECH_MAX_RECOMMENDED_TOW: 'Takeoff weight limit',
  TOPO_ORPHAN: 'Disconnected part',
};

/**
 * Maps domain results to UI-facing copy.
 * Must not alter engineering or validation outcomes.
 */
@Injectable({ providedIn: 'root' })
export class BuilderPresentationMapperService {
  categoryLabel(type: ComponentType): string {
    return CATEGORY_LABELS[type] ?? type;
  }

  mapIssue(issue: ValidationIssue): BuilderCompatibilityIssueView {
    const issueClass = this.classifySeverity(issue.severity);
    const title =
      ISSUE_TITLES[issue.ruleCode] ??
      issue.ruleCode.replace(/_/g, ' ').toLowerCase();
    const explanation = issue.messageKey.replace(/\./g, ' ');
    const suggestedAction =
      issue.remediationKeys[0]?.replace(/\./g, ' ') ??
      (issueClass === 'blocking-error'
        ? 'Fix this part choice before compiling.'
        : 'Review this note before flying.');
    return {
      issueClass,
      title,
      explanation,
      suggestedAction,
      affectedCategory: this.inferCategory(issue),
      relatedSelectionIds: issue.relatedSelectionIds,
      domainCode: issue.ruleCode,
      severity: issue.severity,
    };
  }

  mapValidationReport(
    report: ValidationReport | null | undefined,
  ): BuilderCompatibilityIssueView[] {
    if (!report) return [];
    return report.issues.map((issue) => this.mapIssue(issue));
  }

  mapComponentOption(
    revision: ComponentRevision,
    compatibilityStatus: BuilderComponentOptionView['compatibilityStatus'] = 'unknown',
  ): BuilderComponentOptionView {
    return {
      revisionId: revision.revisionId,
      name: revision.display.displayName,
      category: revision.componentType,
      recommendedUse:
        revision.display.tags[0] ??
        revision.display.categoryLabels[0] ??
        this.categoryLabel(revision.componentType),
      compatibilityStatus,
      simplePerformanceEffect: this.simpleEffect(revision),
      massKg: revision.massKg,
      revision: revision.revisionId,
      physicalSummary: this.physicalSummary(revision),
      electricalSummary: this.electricalSummary(revision),
      dataConfidence: this.mapDataConfidence(revision.dataQuality.confidence),
      dataSource: this.mapCatalogProvenance(revision.dataQuality.provenance),
      warnings: [],
    };
  }

  mapEngineeringStats(
    spec: CompiledAircraftSpecification | null | undefined,
  ): BuilderEngineeringStatView[] {
    if (!spec) return [];
    const propulsion = spec.propulsion;
    const electrical = spec.electrical.battery;
    const performance = spec.performance;
    const runtime = spec.flightRuntime;
    const source = this.mapPropulsionProvenance(propulsion.dataProvenance);
    const confidence = propulsion.confidence;

    return [
      {
        id: 'total-mass',
        label: 'Total takeoff mass',
        simpleLabel: 'Weight',
        value: round(spec.physicalAssembly.totalMassKg, 3),
        unit: 'kg',
        confidence: 'medium',
        source: 'Estimated',
        limitations: 'Sum of selected component masses.',
        advancedOnly: false,
      },
      {
        id: 'thrust',
        label: 'Estimated total thrust',
        simpleLabel: 'Power',
        value: round(propulsion.totalMaxThrustNewtons, 1),
        unit: 'N',
        confidence,
        source,
        limitations:
          propulsion.warnings[0] ?? 'Depends on propulsion data quality.',
        advancedOnly: false,
      },
      {
        id: 'twr',
        label: 'Thrust-to-weight ratio',
        simpleLabel: 'Punch',
        value: round(propulsion.thrustToWeight, 2),
        unit: '×',
        confidence,
        source,
        limitations: 'Higher means stronger climb and acceleration.',
        advancedOnly: false,
      },
      {
        id: 'hover-throttle',
        label: 'Estimated hover throttle',
        simpleLabel: 'Hover throttle',
        value: round(performance.hoverThrottle * 100, 0),
        unit: '%',
        confidence,
        source,
        limitations: 'Estimate at sea-level hover; not a guarantee.',
        advancedOnly: false,
      },
      {
        id: 'flight-time',
        label: 'Estimated flight time',
        simpleLabel: 'Flight time',
        value: `${round(performance.flightDurationMinutesMin, 1)}–${round(performance.flightDurationMinutesMax, 1)}`,
        unit: 'min',
        confidence: confidence === 'high' ? 'medium' : confidence,
        source,
        limitations: 'Hover-biased estimate; aggressive flying shortens time.',
        advancedOnly: false,
      },
      {
        id: 'battery-voltage',
        label: 'Battery voltage',
        simpleLabel: 'Battery',
        value: round(electrical.nominalVoltage, 1),
        unit: 'V',
        confidence: 'high',
        source: 'Estimated',
        limitations: 'From selected battery cell count and chemistry.',
        advancedOnly: true,
      },
      {
        id: 'battery-capacity',
        label: 'Battery capacity',
        simpleLabel: 'Capacity',
        value: round(runtime.batteryCapacityMah, 0),
        unit: 'mAh',
        confidence: 'high',
        source: 'Estimated',
        limitations: 'Catalog capacity; real packs vary.',
        advancedOnly: true,
      },
      {
        id: 'max-current',
        label: 'Maximum current estimate',
        simpleLabel: 'Current',
        value: round(electrical.peakCurrentA, 1),
        unit: 'A',
        confidence: 'medium',
        source: 'Estimated',
        limitations: 'Electrical solver estimate under peak load.',
        advancedOnly: true,
      },
      {
        id: 'esc-headroom',
        label: 'ESC continuous headroom',
        simpleLabel: 'ESC headroom',
        value: round(electrical.escContinuousMarginA, 1),
        unit: 'A',
        confidence: 'medium',
        source: 'Estimated',
        limitations: 'Positive values mean the ESC has spare continuous current.',
        advancedOnly: true,
      },
      {
        id: 'power-confidence',
        label: 'Power-system confidence',
        simpleLabel: 'Data confidence',
        value: confidence,
        unit: '',
        confidence,
        source,
        limitations: this.provenanceLimitation(propulsion.dataProvenance),
        advancedOnly: true,
      },
      {
        id: 'power-source',
        label: 'Calculation source',
        simpleLabel: 'Data source',
        value: source,
        unit: '',
        confidence,
        source,
        limitations: this.provenanceLimitation(propulsion.dataProvenance),
        advancedOnly: true,
      },
    ];
  }

  mapCompileResult(
    result: CompilationResult,
    aircraftId: string | null,
    aircraftDisplayName: string | null,
  ): BuilderCompileResultView {
    const issues = this.mapValidationReport(result.validation);
    const blocking = issues.filter((i) => i.issueClass === 'blocking-error');
    const warnings = issues.filter((i) => i.issueClass === 'warning');
    const ok = result.ok && !!result.specification;
    return {
      ok,
      aircraftId: ok ? aircraftId : null,
      aircraftDisplayName: ok ? aircraftDisplayName : null,
      buildFingerprint: result.specification?.buildFingerprint ?? null,
      artifactFingerprint: result.specification?.artifactFingerprint ?? null,
      blockingIssues: blocking,
      warnings,
      message: ok
        ? `Compiled ${aircraftDisplayName ?? 'aircraft'} successfully.`
        : (blocking[0]?.suggestedAction ??
          'Compilation failed. Resolve blocking issues and try again.'),
    };
  }

  classifySeverity(severity: ValidationSeverity): CompatibilityIssueClass {
    if (severity === 'fatal' || severity === 'error') return 'blocking-error';
    if (severity === 'warning') return 'warning';
    if (severity === 'info') return 'information';
    return 'recommendation';
  }

  mapPropulsionProvenance(
    provenance: PropulsionDataProvenance | string | undefined,
  ): EngineeringStatSourceLabel {
    switch (provenance) {
      case 'measured-table':
        return 'Measured';
      case 'curated-estimate-table':
        return 'Curated synthetic';
      case 'estimated':
        return 'Estimated';
      case 'peak-thrust-hint-fallback':
        return 'Legacy fallback';
      default:
        return 'Unavailable';
    }
  }

  private mapDataConfidence(
    confidence: string | undefined,
  ): EngineeringStatConfidenceLabel {
    if (
      confidence === 'high' ||
      confidence === 'medium' ||
      confidence === 'low'
    ) {
      return confidence;
    }
    return 'unavailable';
  }

  private mapCatalogProvenance(
    provenance: string | undefined,
  ): EngineeringStatSourceLabel {
    switch (provenance) {
      case 'measured':
        return 'Measured';
      case 'curated':
      case 'manufacturer-like-reference':
        return 'Curated synthetic';
      case 'estimated':
      case 'derived':
      case 'community-supplied':
        return 'Estimated';
      default:
        return 'Unavailable';
    }
  }

  private provenanceLimitation(provenance: string | undefined): string {
    switch (provenance) {
      case 'measured-table':
        return 'Matched to a measured propulsion dataset.';
      case 'curated-estimate-table':
        return 'Uses curated synthetic propulsion tables — not commercial measured claims.';
      case 'peak-thrust-hint-fallback':
        return 'Uses explicit legacy peak-thrust hint fallback with low confidence.';
      case 'estimated':
        return 'Estimated from component hints when no table matched.';
      default:
        return 'Source unavailable for this calculation.';
    }
  }

  private inferCategory(
    issue: ValidationIssue,
  ): ComponentType | 'build' | 'unknown' {
    const path = issue.affectedPath.toLowerCase();
    const types: ComponentType[] = [
      'frame',
      'motor',
      'propeller',
      'esc',
      'battery',
      'flight-controller',
      'camera',
      'video-transmitter',
      'receiver',
      'antenna',
      'gps-module',
      'payload',
      'protective-accessory',
      'cosmetic',
    ];
    for (const type of types) {
      if (path.includes(type)) return type;
    }
    if (issue.relatedSelectionIds.length === 0) return 'build';
    return 'unknown';
  }

  private physicalSummary(revision: ComponentRevision): string {
    return `${round(revision.massKg, 3)} kg`;
  }

  private electricalSummary(revision: ComponentRevision): string {
    const eng = revision.engineering;
    if (eng.type === 'battery') {
      return `${eng.battery.cellCount}S · ${round(eng.battery.capacityAh * 1000, 0)} mAh`;
    }
    if (eng.type === 'esc') {
      return `${eng.esc.continuousCurrentA}A continuous`;
    }
    if (eng.type === 'motor') {
      return `${eng.motor.kv} KV`;
    }
    return 'See advanced details';
  }

  private simpleEffect(revision: ComponentRevision): string {
    switch (revision.componentType) {
      case 'motor':
        return 'Affects thrust and responsiveness';
      case 'battery':
        return 'Affects flight time and weight';
      case 'propeller':
        return 'Affects thrust and efficiency';
      case 'frame':
        return 'Sets size and layout';
      case 'esc':
        return 'Affects power handling';
      default:
        return `Affects ${this.categoryLabel(revision.componentType).toLowerCase()}`;
    }
  }
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
