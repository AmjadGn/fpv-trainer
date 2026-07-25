import { Injectable, inject } from '@angular/core';
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
  BuilderAdvancedComponentDetailView,
  BuilderProvenanceInfoView,
  BuilderSpecFieldView,
  BuilderTuningInfoView,
  CompatibilityIssueClass,
  CompatibilitySummaryLevel,
  EngineeringStatConfidenceLabel,
  EngineeringStatSourceLabel,
} from '../models/drone-builder-view.models';
import type { ResolvedComponentMedia } from '../models/component-presentation-media.models';
import { ComponentPresentationMediaService } from './component-presentation-media.service';
import type { UserTuningValues } from '@fpv/drone-build-domain';

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
  private readonly media = inject(ComponentPresentationMediaService);

  categoryLabel(type: ComponentType): string {
    return stockedCategoryLabel(type);
  }

  resolveMedia(
    revisionId: string,
    category: ComponentType,
    displayName?: string | null,
  ): ResolvedComponentMedia {
    return this.media.resolve(revisionId, category, displayName);
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
      media: this.media.resolve(
        revision.revisionId,
        revision.componentType,
        revision.display.displayName,
      ),
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
      this.stat({
        id: 'dry-mass',
        label: 'Dry mass',
        simpleLabel: 'Dry mass',
        value: Number.isFinite(spec.physicalAssembly.dryMassKg)
          ? round(spec.physicalAssembly.dryMassKg, 3)
          : null,
        unit: 'kg',
        confidence: 'medium',
        source: 'Estimated',
        interpretation: 'Airframe and components without the battery pack.',
        limitations: 'From catalog component masses.',
        advancedOnly: true,
      }),
      this.stat({
        id: 'battery-mass',
        label: 'Battery mass',
        simpleLabel: 'Battery mass',
        value: Number.isFinite(spec.physicalAssembly.batteryMassKg)
          ? round(spec.physicalAssembly.batteryMassKg, 3)
          : null,
        unit: 'kg',
        confidence: 'medium',
        source: 'Estimated',
        interpretation: 'Selected pack mass contribution.',
        limitations: 'Catalog mass; real packs vary.',
        advancedOnly: true,
      }),
      this.stat({
        id: 'payload-mass',
        label: 'Payload mass',
        simpleLabel: 'Payload mass',
        value:
          Number.isFinite(spec.diagnostics.mass.payloadMassKg) &&
          spec.diagnostics.mass.payloadMassKg > 0
            ? round(spec.diagnostics.mass.payloadMassKg, 3)
            : Number.isFinite(spec.diagnostics.mass.payloadMassKg)
              ? 'None'
              : null,
        unit:
          Number.isFinite(spec.diagnostics.mass.payloadMassKg) &&
          spec.diagnostics.mass.payloadMassKg > 0
            ? 'kg'
            : '',
        confidence: 'medium',
        source: 'Estimated',
        interpretation:
          spec.diagnostics.mass.payloadMassKg > 0
            ? 'Configured payload contribution.'
            : 'No payload selected in this build.',
        limitations: 'Only stocked categories are available in this milestone.',
        advancedOnly: true,
      }),
      this.stat({
        id: 'esc-headroom',
        label: 'ESC continuous headroom',
        simpleLabel: 'ESC headroom',
        value: Number.isFinite(electrical.escContinuousMarginA)
          ? round(electrical.escContinuousMarginA, 1)
          : null,
        unit: 'A',
        confidence: 'medium',
        source: 'Estimated',
        interpretation: 'Estimated continuous current margin on the ESC.',
        limitations: 'Derived from catalog ratings and estimated load.',
        advancedOnly: true,
      }),
      this.stat({
        id: 'estimated-current',
        label: 'Estimated continuous current',
        simpleLabel: 'Estimated current',
        value: Number.isFinite(electrical.continuousCurrentA)
          ? round(electrical.continuousCurrentA, 1)
          : null,
        unit: 'A',
        confidence,
        source,
        interpretation: 'Estimated continuous electrical load.',
        limitations: 'Depends on propulsion and electrical models.',
        advancedOnly: true,
      }),
      this.stat({
        id: 'runtime-mass',
        label: 'Runtime mass mapping',
        simpleLabel: 'Runtime mass',
        value: Number.isFinite(spec.flightRuntime.massKg)
          ? round(spec.flightRuntime.massKg, 3)
          : null,
        unit: 'kg',
        confidence: 'medium',
        source: 'Estimated',
        interpretation: 'Mass value mapped into the fixed-timestep runtime adapter.',
        limitations: 'Runtime mapping may clamp or scale for solver compatibility.',
        advancedOnly: true,
      }),
      this.stat({
        id: 'runtime-thrust',
        label: 'Runtime max thrust',
        simpleLabel: 'Runtime thrust',
        value: Number.isFinite(spec.flightRuntime.maxThrustNewtons)
          ? round(spec.flightRuntime.maxThrustNewtons, 1)
          : null,
        unit: 'N',
        confidence,
        source,
        interpretation: 'Peak thrust mapped for the simulator runtime.',
        limitations: 'Adapter output — not a separate physical model.',
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
    const spec = result.specification;
    const failedStage =
      !ok && result.trace.length > 0
        ? result.trace[result.trace.length - 1]?.stage ?? null
        : null;
    const confidenceSummary = ok
      ? this.mapPropulsionProvenance(spec!.propulsion.dataProvenance)
      : null;
    return {
      ok,
      aircraftId: ok ? aircraftId : null,
      aircraftDisplayName: ok ? aircraftDisplayName : null,
      buildFingerprint: spec?.buildFingerprint ?? null,
      artifactFingerprint: spec?.artifactFingerprint ?? null,
      blockingIssues: blocking,
      warnings,
      message: ok
        ? `Ready to fly: ${aircraftDisplayName ?? 'aircraft'}`
        : (blocking[0]?.suggestedAction ??
          'Compilation failed. Resolve blocking issues and try again.'),
      sourceBuildRevisionId: spec?.identity.buildRevisionId ?? null,
      catalogReleaseId: spec?.identity.catalogReleaseId ?? null,
      validationCanCompile: result.validation?.canCompile ?? null,
      confidenceSummary,
      failedStage,
      developmentDiagnosticCode: !ok
        ? (blocking[0]?.domainCode ??
          result.integrityIssues[0]?.code ??
          'COMPILE_FAILED')
        : null,
    };
  }

  mapAdvancedComponentDetail(
    revision: ComponentRevision,
    opts: {
      compatibilityStatus?: BuilderComponentOptionView['compatibilityStatus'];
      selected?: boolean;
      isRecommended?: boolean;
    } = {},
  ): BuilderAdvancedComponentDetailView {
    const option = this.mapComponentOption(revision, opts);
    return {
      option,
      revisionDisplay: revision.revisionId,
      manufacturerLabel: revision.display.manufacturerLabel || 'Not available',
      tags: revision.display.tags,
      physicalSpecs: this.physicalSpecs(revision),
      electricalSpecs: this.electricalSpecs(revision),
      dataAvailability: this.dataAvailabilityLabel(revision),
    };
  }

  mapTuningInfo(tuning: UserTuningValues | null | undefined): BuilderTuningInfoView {
    if (!tuning) {
      return {
        editable: false,
        summary:
          'No tuning profile is loaded yet. Choose a flying style to start from a factory preset.',
        fields: [],
      };
    }
    return {
      editable: false,
      summary:
        'This build uses the factory/intent default tuning profile. A validated tuning editor is not available in this milestone — values are shown read-only and cannot be edited here.',
      fields: [
        field('Thrust curve exponent', formatNumber(tuning.thrustCurveExponent, 2)),
        field('Throttle expo', formatNumber(tuning.throttleExpo, 2)),
        field('Stabilization bias', formatNumber(tuning.stabilizationBias, 2)),
        field('Rate profile hint', tuning.rateProfileHint || null),
      ],
    };
  }

  mapProvenanceInfo(
    provenance: PropulsionDataProvenance | string | undefined,
    confidence: EngineeringStatConfidenceLabel | string | undefined,
  ): BuilderProvenanceInfoView {
    const label = this.mapPropulsionProvenance(provenance);
    const conf = this.mapDataConfidence(
      typeof confidence === 'string' ? confidence : undefined,
    );
    return {
      label,
      description: this.provenanceDescription(label),
      confidence: conf,
      datasetHint: null,
      limitations: this.provenanceLimitation(
        typeof provenance === 'string' ? provenance : undefined,
      ),
    };
  }

  provenanceDescription(source: EngineeringStatSourceLabel): string {
    switch (source) {
      case 'Measured':
        return 'Based on measured propulsion data from a matched dataset.';
      case 'Curated synthetic':
        return 'Based on a controlled project dataset created for development. It is not a measured commercial benchmark.';
      case 'Estimated':
        return 'Derived from component specifications and engineering formulas.';
      case 'Legacy fallback':
        return 'Calculated from the aircraft fallback thrust hint because no matching propulsion dataset was available.';
      default:
        return 'Propulsion data is not available for this combination.';
    }
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

  private physicalSpecs(revision: ComponentRevision): BuilderSpecFieldView[] {
    const eng = revision.engineering;
    const dims = revision.dimensions;
    const common: BuilderSpecFieldView[] = [
      field('Mass', Number.isFinite(revision.massKg) ? `${round(revision.massKg, 3)} kg` : null),
      field(
        'Dimensions',
        Number.isFinite(dims.widthMeters) &&
          Number.isFinite(dims.lengthMeters) &&
          Number.isFinite(dims.heightMeters)
          ? `${round(dims.widthMeters * 1000, 0)} × ${round(dims.lengthMeters * 1000, 0)} × ${round(dims.heightMeters * 1000, 0)} mm`
          : null,
      ),
      field(
        'Mounting patterns',
        revision.mountingPatterns.length > 0
          ? revision.mountingPatterns.join(', ')
          : null,
      ),
    ];

    if (eng.type === 'frame') {
      return [
        ...common,
        field(
          'Wheelbase',
          `${round(eng.frame.wheelbaseMeters * 1000, 0)} mm`,
        ),
        field(
          'Supported prop size',
          `${round(eng.frame.supportedPropDiameterMinM * 1000, 0)}–${round(eng.frame.supportedPropDiameterMaxM * 1000, 0)} mm`,
        ),
        field('Motor mount pattern', eng.frame.motorMountPattern || null),
        field(
          'Max recommended takeoff mass',
          `${round(eng.frame.maxRecommendedTakeoffMassKg, 3)} kg`,
        ),
      ];
    }
    if (eng.type === 'motor') {
      return [
        ...common,
        field('KV', `${eng.motor.kv}`),
        field(
          'Stator',
          `${eng.motor.statorWidthMm}×${eng.motor.statorHeightMm} mm`,
        ),
        field(
          'Supported voltage',
          `${round(eng.motor.voltageMin, 1)}–${round(eng.motor.voltageMax, 1)} V`,
        ),
        field(
          'Max continuous current',
          `${round(eng.motor.maxContinuousCurrentA, 1)} A`,
        ),
        field(
          'Max continuous power',
          `${round(eng.motor.maxContinuousPowerW, 0)} W`,
        ),
      ];
    }
    if (eng.type === 'propeller') {
      return [
        ...common,
        field('Diameter', `${round(eng.propeller.diameterMeters * 1000, 0)} mm`),
        field('Pitch', `${round(eng.propeller.pitchMeters * 1000, 0)} mm`),
        field('Blade count', `${eng.propeller.bladeCount}`),
      ];
    }
    if (eng.type === 'esc') {
      return [
        ...common,
        field('Topology', eng.esc.topology || null),
        field('Protocols', eng.esc.protocols.join(', ') || null),
      ];
    }
    if (eng.type === 'battery') {
      return common;
    }
    if (eng.type === 'camera') {
      return [
        ...common,
        field(
          'Format / size',
          Number.isFinite(dims.widthMeters)
            ? `${round(dims.widthMeters * 1000, 0)} mm class`
            : null,
        ),
      ];
    }
    return common;
  }

  private electricalSpecs(revision: ComponentRevision): BuilderSpecFieldView[] {
    const eng = revision.engineering;
    if (eng.type === 'battery') {
      return [
        field('Cell count', `${eng.battery.cellCount}S`),
        field('Nominal voltage', `${round(eng.battery.nominalVoltage, 1)} V`),
        field('Capacity', `${round(eng.battery.capacityAh * 1000, 0)} mAh`),
        field('Discharge rating', `${eng.battery.dischargeCRating}C`),
        field('Connector', eng.battery.connectorType || null),
      ];
    }
    if (eng.type === 'esc') {
      return [
        field(
          'Continuous current',
          `${round(eng.esc.continuousCurrentA, 1)} A`,
        ),
        field('Burst current', `${round(eng.esc.burstCurrentA, 1)} A`),
        field(
          'Supported voltage',
          `${round(eng.esc.voltageMin, 1)}–${round(eng.esc.voltageMax, 1)} V`,
        ),
      ];
    }
    if (eng.type === 'motor') {
      return [
        field(
          'Supported voltage',
          `${round(eng.motor.voltageMin, 1)}–${round(eng.motor.voltageMax, 1)} V`,
        ),
        field(
          'Max continuous current',
          `${round(eng.motor.maxContinuousCurrentA, 1)} A`,
        ),
      ];
    }
    if (
      eng.type === 'flight-controller' ||
      eng.type === 'camera' ||
      eng.type === 'video-transmitter' ||
      eng.type === 'receiver'
    ) {
      return [
        field(
          'Power draw',
          `${round(eng.electronics.powerDrawWatts, 2)} W`,
        ),
      ];
    }
    return [];
  }

  private dataAvailabilityLabel(revision: ComponentRevision): string {
    const { provenance, confidence } = revision.dataQuality;
    return `${provenance.replace(/-/g, ' ')} · ${confidence} confidence`;
  }
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function formatNumber(value: number, digits: number): string | null {
  if (!Number.isFinite(value)) return null;
  return String(round(value, digits));
}

function field(label: string, value: string | null | undefined): BuilderSpecFieldView {
  const available = value != null && value !== '' && value !== 'NaN';
  return {
    label,
    value: available ? value! : 'Not available',
    available,
  };
}
