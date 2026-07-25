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

import { stockedCategoryLabel } from '../models/build-intent.profiles';
import type {
  BuilderCompatibilityIssueView,
  BuilderCompileResultView,
  BuilderComponentOptionView,
  BuilderEngineeringStatView,
  CompatibilityIssueClass,
  CompatibilitySummaryLevel,
  EngineeringStatConfidenceLabel,
  EngineeringStatSourceLabel,
} from '../models/drone-builder-view.models';

const ISSUE_COPY: Record<
  string,
  { title: string; explanation: string; action: string }
> = {
  ELEC_VOLTAGE_COMPAT: {
    title: 'Battery voltage does not match the ESC',
    explanation:
      'This battery’s voltage is outside what the selected ESC can safely use.',
    action: 'Choose a lower-voltage battery or a compatible ESC.',
  },
  ELEC_ESC_CURRENT_MARGIN: {
    title: 'ESC may not handle the motor current',
    explanation:
      'The motors can draw more current than this ESC is rated to deliver continuously.',
    action: 'Pick a higher-current ESC or cooler-running motors.',
  },
  ELEC_BATTERY_DISCHARGE: {
    title: 'Battery may struggle under peak load',
    explanation:
      'This pack’s discharge rating looks tight for the selected motors.',
    action: 'Choose a higher-discharge battery or less demanding motors.',
  },
  MECH_PROP_MOTOR_DIAMETER: {
    title: 'Propeller size is not ideal for these motors',
    explanation:
      'The selected propeller diameter is outside the motor’s recommended range.',
    action: 'Pick a propeller sized for these motors.',
  },
  MECH_PROP_CLEARANCE: {
    title: 'Propellers may not clear the frame',
    explanation:
      'These propellers look too large for the selected frame.',
    action: 'Choose smaller propellers or a larger frame.',
  },
  MECH_MOTOR_MOUNT_PATTERN: {
    title: 'Motors may not fit this frame mount',
    explanation:
      'The motor mount pattern does not match the frame.',
    action: 'Choose motors that match the frame mount pattern.',
  },
  MECH_MAX_RECOMMENDED_TOW: {
    title: 'Build is heavier than this frame prefers',
    explanation:
      'Total weight is above the frame’s recommended takeoff mass.',
    action: 'Lighten the build or choose a frame rated for more weight.',
  },
  STRUCT_FRAME_REQUIRED: {
    title: 'A frame is required',
    explanation: 'Every build needs a frame before it can compile.',
    action: 'Select a frame to continue.',
  },
  STRUCT_BATTERY_REQUIRED: {
    title: 'A battery is required',
    explanation: 'The craft needs a battery to power the system.',
    action: 'Select a battery.',
  },
  STRUCT_ESC_REQUIRED: {
    title: 'An ESC is required',
    explanation: 'Motors need an ESC to receive power and control.',
    action: 'Select an ESC.',
  },
  STRUCT_MOTORS_COUNT: {
    title: 'Motor setup is incomplete',
    explanation: 'This builder expects a complete four-motor layout.',
    action: 'Select motors so all four positions are filled.',
  },
  RES_FROM_ASSEMBLY: {
    title: 'A selected part could not be loaded',
    explanation:
      'One of the chosen components is missing from the catalog.',
    action: 'Re-select that category with a catalog part.',
  },
};

/**
 * Maps domain results to UI-facing copy.
 * Must not alter engineering or validation outcomes.
 */
@Injectable({ providedIn: 'root' })
export class BuilderPresentationMapperService {
  categoryLabel(type: ComponentType): string {
    return stockedCategoryLabel(type);
  }

  mapIssue(issue: ValidationIssue): BuilderCompatibilityIssueView {
    const issueClass = this.classifySeverity(issue.severity);
    const copy = ISSUE_COPY[issue.ruleCode];
    const title =
      copy?.title ??
      issue.ruleCode.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) =>
        c.toUpperCase(),
      );
    const explanation =
      copy?.explanation ??
      this.humanizeKey(issue.messageKey) ??
      'This combination needs attention before flying.';
    const suggestedAction =
      copy?.action ??
      (issue.remediationKeys[0]
        ? this.humanizeKey(issue.remediationKeys[0])
        : issueClass === 'blocking-error'
          ? 'Fix this part choice before compiling.'
          : 'Review this note before flying.');
    const affectedCategory = this.inferCategory(issue);
    return {
      issueClass,
      title,
      explanation,
      suggestedAction,
      affectedPartLabel:
        affectedCategory === 'build' || affectedCategory === 'unknown'
          ? 'Whole build'
          : this.categoryLabel(affectedCategory),
      affectedCategory,
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

  compatibilitySummaryLevel(
    issues: readonly BuilderCompatibilityIssueView[],
  ): CompatibilitySummaryLevel {
    if (issues.some((i) => i.issueClass === 'blocking-error')) {
      return 'cannot-compile';
    }
    if (issues.some((i) => i.issueClass === 'warning')) {
      return 'needs-attention';
    }
    if (
      issues.some(
        (i) =>
          i.issueClass === 'recommendation' || i.issueClass === 'information',
      )
    ) {
      return 'recommendation';
    }
    return 'all-compatible';
  }

  mapComponentOption(
    revision: ComponentRevision,
    opts: {
      compatibilityStatus?: BuilderComponentOptionView['compatibilityStatus'];
      selected?: boolean;
      isRecommended?: boolean;
    } = {},
  ): BuilderComponentOptionView {
    const massKg = Number.isFinite(revision.massKg) ? revision.massKg : null;
    return {
      revisionId: revision.revisionId,
      name: revision.display.displayName,
      category: revision.componentType,
      categoryLabel: this.categoryLabel(revision.componentType),
      mainSpec: this.mainSpec(revision),
      recommendedUse:
        revision.display.tags[0] ??
        revision.display.categoryLabels[0] ??
        this.categoryLabel(revision.componentType),
      compatibilityStatus: opts.compatibilityStatus ?? 'unknown',
      simplePerformanceEffect: this.simpleEffect(revision),
      massKg,
      massLabel:
        massKg == null ? 'Weight not listed' : `${round(massKg, 3)} kg`,
      isRecommended: opts.isRecommended ?? false,
      selected: opts.selected ?? false,
    };
  }

  mapEngineeringStats(
    spec: CompiledAircraftSpecification | null | undefined,
  ): BuilderEngineeringStatView[] {
    if (!spec) return [];
    const propulsion = spec.propulsion;
    const electrical = spec.electrical.battery;
    const performance = spec.performance;
    const source = this.mapPropulsionProvenance(propulsion.dataProvenance);
    const confidence = propulsion.confidence;
    const twr = propulsion.thrustToWeight;
    const hoverPct = performance.hoverThrottle * 100;
    const mass = spec.physicalAssembly.totalMassKg;

    return [
      this.stat({
        id: 'total-mass',
        label: 'Total takeoff mass',
        simpleLabel: 'Total weight',
        value: Number.isFinite(mass) ? round(mass, 3) : null,
        unit: 'kg',
        confidence: 'medium',
        source: 'Estimated',
        interpretation: this.massInterpretation(mass),
        limitations: 'Sum of selected component masses.',
        advancedOnly: false,
      }),
      this.stat({
        id: 'twr',
        label: 'Thrust-to-weight ratio',
        simpleLabel: 'Agility / punch',
        value: Number.isFinite(twr) ? round(twr, 2) : null,
        unit: '×',
        confidence,
        source,
        interpretation: this.twrInterpretation(twr),
        limitations: 'Higher means stronger climb and acceleration.',
        advancedOnly: false,
      }),
      this.stat({
        id: 'flight-time',
        label: 'Estimated flight time',
        simpleLabel: 'Estimated flight time',
        value:
          Number.isFinite(performance.flightDurationMinutesMin) &&
          Number.isFinite(performance.flightDurationMinutesMax)
            ? `${round(performance.flightDurationMinutesMin, 1)}–${round(performance.flightDurationMinutesMax, 1)}`
            : null,
        unit: 'min',
        confidence: confidence === 'high' ? 'medium' : confidence,
        source,
        interpretation: this.flightTimeInterpretation(
          performance.flightDurationMinutesMax,
        ),
        limitations: 'Hover-biased estimate; aggressive flying shortens time.',
        advancedOnly: false,
      }),
      this.stat({
        id: 'hover-throttle',
        label: 'Estimated hover throttle',
        simpleLabel: 'Hover throttle',
        value: Number.isFinite(hoverPct) ? round(hoverPct, 0) : null,
        unit: '%',
        confidence,
        source,
        interpretation: this.hoverInterpretation(hoverPct),
        limitations: 'Estimate at sea-level hover; not a guarantee.',
        advancedOnly: false,
      }),
      this.stat({
        id: 'battery-config',
        label: 'Battery configuration',
        simpleLabel: 'Battery',
        value:
          Number.isFinite(electrical.cellCount) &&
          Number.isFinite(electrical.nominalVoltage)
            ? `${electrical.cellCount}S · ${round(electrical.nominalVoltage, 1)} V`
            : null,
        unit: '',
        confidence: 'high',
        source: 'Estimated',
        interpretation: 'From the selected battery pack.',
        limitations: 'Catalog pack rating; real packs vary.',
        advancedOnly: false,
      }),
      this.stat({
        id: 'power-confidence',
        label: 'Power-system confidence',
        simpleLabel: 'Performance confidence',
        value: source,
        unit: '',
        confidence,
        source,
        interpretation: this.sourceBrief(source),
        limitations: this.provenanceLimitation(propulsion.dataProvenance),
        advancedOnly: false,
      }),
      this.stat({
        id: 'thrust',
        label: 'Estimated total thrust',
        simpleLabel: 'Estimated thrust',
        value: Number.isFinite(propulsion.totalMaxThrustNewtons)
          ? round(propulsion.totalMaxThrustNewtons, 1)
          : null,
        unit: 'N',
        confidence,
        source,
        interpretation: 'Peak thrust estimate for the selected motors and props.',
        limitations:
          propulsion.warnings[0] ?? 'Depends on propulsion data quality.',
        advancedOnly: true,
      }),
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
        ? `Ready to fly: ${aircraftDisplayName ?? 'aircraft'}`
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

  sourceBrief(source: EngineeringStatSourceLabel): string {
    switch (source) {
      case 'Measured':
        return 'Based on measured propulsion data.';
      case 'Curated synthetic':
        return 'Estimated from curated synthetic data.';
      case 'Estimated':
        return 'Estimated from component hints.';
      case 'Legacy fallback':
        return 'Uses a low-confidence legacy thrust estimate.';
      default:
        return 'Not available for this combination.';
    }
  }

  private stat(input: {
    id: string;
    label: string;
    simpleLabel: string;
    value: number | string | null;
    unit: string;
    confidence: EngineeringStatConfidenceLabel;
    source: EngineeringStatSourceLabel;
    interpretation: string;
    limitations: string;
    advancedOnly: boolean;
  }): BuilderEngineeringStatView {
    const available =
      input.value !== null &&
      input.value !== undefined &&
      !(typeof input.value === 'number' && !Number.isFinite(input.value));
    return {
      id: input.id,
      label: input.label,
      simpleLabel: input.simpleLabel,
      value: available ? input.value : null,
      displayValue: available
        ? `${input.value}${input.unit ? ` ${input.unit}` : ''}`
        : 'Not available for this combination',
      interpretation: available
        ? input.interpretation
        : 'Not available for this combination',
      unit: input.unit,
      confidence: available ? input.confidence : 'unavailable',
      source: available ? input.source : 'Unavailable',
      sourceBrief: this.sourceBrief(available ? input.source : 'Unavailable'),
      limitations: input.limitations,
      available,
      advancedOnly: input.advancedOnly,
    };
  }

  private massInterpretation(massKg: number): string {
    if (!Number.isFinite(massKg)) return 'Not available for this combination';
    if (massKg < 0.25) return 'Very light micro class';
    if (massKg < 0.55) return 'Light cinematic / freestyle class';
    if (massKg < 0.85) return 'Typical 5-inch class weight';
    return 'Heavier long-range oriented weight';
  }

  private twrInterpretation(twr: number): string {
    if (!Number.isFinite(twr)) return 'Not available for this combination';
    if (twr >= 4) return 'High';
    if (twr >= 2.5) return 'Medium-high';
    if (twr >= 1.6) return 'Medium';
    return 'Low';
  }

  private flightTimeInterpretation(maxMinutes: number): string {
    if (!Number.isFinite(maxMinutes)) return 'Not available for this combination';
    if (maxMinutes >= 10) return 'Longer estimated flights';
    if (maxMinutes >= 5) return 'Medium-length flights';
    return 'Short flights';
  }

  private hoverInterpretation(hoverPct: number): string {
    if (!Number.isFinite(hoverPct)) return 'Not available for this combination';
    if (hoverPct <= 35) return 'Comfortable hover margin';
    if (hoverPct <= 50) return 'Typical hover demand';
    return 'High hover demand';
  }

  private humanizeKey(key: string): string {
    return key.replace(/[._-]+/g, ' ').trim();
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
    const haystack =
      `${issue.affectedPath} ${issue.ruleCode} ${issue.relatedSelectionIds.join(' ')}`.toLowerCase();
    const pairs: Array<[string, ComponentType]> = [
      ['battery', 'battery'],
      ['esc', 'esc'],
      ['prop', 'propeller'],
      ['motor', 'motor'],
      ['frame', 'frame'],
      ['fc', 'flight-controller'],
      ['flight-controller', 'flight-controller'],
      ['camera', 'camera'],
      ['vtx', 'video-transmitter'],
      ['video', 'video-transmitter'],
      ['receiver', 'receiver'],
      ['rx', 'receiver'],
    ];
    for (const [needle, type] of pairs) {
      if (haystack.includes(needle)) return type;
    }
    if (issue.relatedSelectionIds.length === 0) return 'build';
    return 'unknown';
  }

  private mainSpec(revision: ComponentRevision): string {
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
    if (eng.type === 'propeller') {
      return `${round(eng.propeller.diameterMeters * 1000, 0)} mm · ${eng.propeller.bladeCount}-blade`;
    }
    if (eng.type === 'frame') {
      return `${round(eng.frame.wheelbaseMeters * 1000, 0)} mm wheelbase`;
    }
    return revision.display.categoryLabels[0] ?? this.categoryLabel(revision.componentType);
  }

  private simpleEffect(revision: ComponentRevision): string {
    switch (revision.componentType) {
      case 'motor':
        return 'More responsive thrust feel';
      case 'battery':
        return 'Affects flight time and weight';
      case 'propeller':
        return 'Affects thrust and efficiency';
      case 'frame':
        return 'Sets size, weight, and layout';
      case 'esc':
        return 'Affects power handling headroom';
      case 'camera':
        return 'Affects FPV view and a little weight';
      case 'video-transmitter':
        return 'Affects video range and power draw';
      case 'receiver':
        return 'Affects control link reliability';
      case 'flight-controller':
        return 'Runs flight control and sensors';
      default:
        return `Affects ${this.categoryLabel(revision.componentType).toLowerCase()}`;
    }
  }
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
