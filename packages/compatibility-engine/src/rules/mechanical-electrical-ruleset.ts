import {
  issue,
  type ValidationContext,
  type ValidationIssue,
  type ValidationRule,
} from '../domain/types';

export const mechanicalRules: ValidationRule[] = [
  {
    code: 'MECH_MOTOR_MOUNT_PATTERN',
    phase: 'mechanical',
    evaluate(ctx: ValidationContext): ValidationIssue[] {
      const frame = ctx.assembly.frameComponent;
      const frameSel = ctx.assembly.frameSelection;
      if (!frame || !frameSel || frame.engineering.type !== 'frame') return [];
      const pattern = frame.engineering.frame.motorMountPattern;
      const issues: ValidationIssue[] = [];
      for (const s of ctx.assembly.selectionsByType.get('motor') ?? []) {
        const c = ctx.assembly.componentBySelectionId.get(s.selectionId);
        if (!c) continue;
        if (!c.mountingPatterns.includes(pattern)) {
          issues.push(
            issue(
              'MECH_MOTOR_MOUNT_PATTERN',
              'error',
              'validation.mechanical.motorMountMismatch',
              'mechanical',
              [s.selectionId, frameSel.selectionId],
              { framePattern: pattern, motorPatterns: c.mountingPatterns.join(',') },
            ),
          );
        }
      }
      return issues;
    },
  },
  {
    code: 'MECH_PROP_CLEARANCE',
    phase: 'mechanical',
    evaluate(ctx): ValidationIssue[] {
      const frame = ctx.assembly.frameComponent;
      if (!frame || frame.engineering.type !== 'frame') return [];
      const { supportedPropDiameterMinM, supportedPropDiameterMaxM } =
        frame.engineering.frame;
      const issues: ValidationIssue[] = [];
      for (const s of ctx.assembly.selectionsByType.get('propeller') ?? []) {
        const c = ctx.assembly.componentBySelectionId.get(s.selectionId);
        if (!c || c.engineering.type !== 'propeller') continue;
        const d = c.engineering.propeller.diameterMeters;
        if (d < supportedPropDiameterMinM || d > supportedPropDiameterMaxM) {
          issues.push(
            issue(
              'MECH_PROP_CLEARANCE',
              'error',
              'validation.mechanical.propClearance',
              'mechanical',
              [s.selectionId],
              { diameter: d, min: supportedPropDiameterMinM, max: supportedPropDiameterMaxM },
            ),
          );
        }
      }
      return issues;
    },
  },
  {
    code: 'MECH_PROP_MOTOR_DIAMETER',
    phase: 'mechanical',
    evaluate(ctx): ValidationIssue[] {
      const issues: ValidationIssue[] = [];
      for (const u of ctx.assembly.propulsionUnits) {
        if (
          u.propellerComponent.engineering.type !== 'propeller' ||
          u.motorComponent.engineering.type !== 'motor'
        ) {
          continue;
        }
        const d = u.propellerComponent.engineering.propeller.diameterMeters;
        const { propellerDiameterMinM, propellerDiameterMaxM } =
          u.motorComponent.engineering.motor;
        if (d < propellerDiameterMinM || d > propellerDiameterMaxM) {
          issues.push(
            issue(
              'MECH_PROP_MOTOR_DIAMETER',
              'error',
              'validation.mechanical.propMotorDiameter',
              'mechanical',
              [u.propellerSelection.selectionId, u.motorSelection.selectionId],
              { diameter: d, min: propellerDiameterMinM, max: propellerDiameterMaxM },
            ),
          );
        }
      }
      return issues;
    },
  },
  {
    code: 'MECH_BATTERY_MOUNT_ZONE',
    phase: 'mechanical',
    evaluate(ctx): ValidationIssue[] {
      const frame = ctx.assembly.frameComponent;
      const batt = ctx.assembly.batteryComponent;
      const battSel = ctx.assembly.batterySelection;
      if (!frame || !batt || !battSel || frame.engineering.type !== 'frame') return [];
      const zone = frame.engineering.frame.batteryMountZone;
      const d = batt.dimensions;
      if (
        d.widthMeters > zone.widthMeters + 1e-6 ||
        d.lengthMeters > zone.lengthMeters + 1e-6 ||
        d.heightMeters > zone.heightMeters + 1e-6
      ) {
        return [
          issue(
            'MECH_BATTERY_MOUNT_ZONE',
            'error',
            'validation.mechanical.batteryMountZone',
            'mechanical',
            [battSel.selectionId],
            {
              battW: d.widthMeters,
              battL: d.lengthMeters,
              battH: d.heightMeters,
              zoneW: zone.widthMeters,
              zoneL: zone.lengthMeters,
              zoneH: zone.heightMeters,
            },
          ),
        ];
      }
      return [];
    },
  },
  {
    code: 'MECH_MAX_RECOMMENDED_TOW',
    phase: 'mechanical',
    evaluate(ctx): ValidationIssue[] {
      // Mass checked in post-engineering when snapshot available; use selection mass estimate here.
      const frame = ctx.assembly.frameComponent;
      if (!frame || frame.engineering.type !== 'frame') return [];
      if (!ctx.engineering) return [];
      const max = frame.engineering.frame.maxRecommendedTakeoffMassKg;
      if (ctx.engineering.totalTakeoffMassKg > max + 1e-9) {
        return [
          issue(
            'MECH_MAX_RECOMMENDED_TOW',
            'warning',
            'validation.mechanical.maxRecommendedTow',
            'mechanical',
            ctx.assembly.frameSelection ? [ctx.assembly.frameSelection.selectionId] : [],
            {
              mass: ctx.engineering.totalTakeoffMassKg,
              max,
            },
          ),
        ];
      }
      return [];
    },
  },
];

export const electricalRules: ValidationRule[] = [
  {
    code: 'ELEC_VOLTAGE_COMPAT',
    phase: 'electrical',
    evaluate(ctx): ValidationIssue[] {
      const batt = ctx.assembly.batteryComponent;
      const battSel = ctx.assembly.batterySelection;
      if (!batt || !battSel || batt.engineering.type !== 'battery') return [];
      const vNom = batt.engineering.battery.nominalVoltage;
      const issues: ValidationIssue[] = [];
      for (const [selId, c] of ctx.assembly.componentBySelectionId) {
        if (c.engineering.type === 'motor') {
          const { voltageMin, voltageMax } = c.engineering.motor;
          if (vNom < voltageMin || vNom > voltageMax) {
            issues.push(
              issue(
                'ELEC_VOLTAGE_COMPAT',
                'error',
                'validation.electrical.motorVoltage',
                'electrical',
                [selId, battSel.selectionId],
                { voltage: vNom, min: voltageMin, max: voltageMax },
              ),
            );
          }
        }
        if (c.engineering.type === 'esc') {
          const { voltageMin, voltageMax } = c.engineering.esc;
          if (vNom < voltageMin || vNom > voltageMax) {
            issues.push(
              issue(
                'ELEC_VOLTAGE_COMPAT',
                'error',
                'validation.electrical.escVoltage',
                'electrical',
                [selId, battSel.selectionId],
                { voltage: vNom, min: voltageMin, max: voltageMax },
              ),
            );
          }
        }
      }
      return issues;
    },
  },
  {
    code: 'ELEC_ESC_CURRENT_MARGIN',
    phase: 'electrical',
    evaluate(ctx): ValidationIssue[] {
      const esc = ctx.assembly.escComponents[0];
      const escSel = ctx.assembly.escSelections[0];
      if (!esc || !escSel || esc.engineering.type !== 'esc') return [];
      const motors = [...(ctx.assembly.selectionsByType.get('motor') ?? [])];
      let continuousDemand = 0;
      let peakDemand = 0;
      for (const s of motors) {
        const c = ctx.assembly.componentBySelectionId.get(s.selectionId);
        if (!c || c.engineering.type !== 'motor') continue;
        continuousDemand += c.engineering.motor.maxContinuousCurrentA * s.quantity;
        peakDemand += c.engineering.motor.maxContinuousCurrentA * 1.2 * s.quantity;
      }
      // 4in1 ESC continuous is typically per-channel.
      const channels = Math.max(1, motors.length);
      const contPerChannel = continuousDemand / channels;
      const burstPerChannel = peakDemand / channels;
      const issues: ValidationIssue[] = [];
      if (contPerChannel > esc.engineering.esc.continuousCurrentA + 1e-9) {
        issues.push(
          issue(
            'ELEC_ESC_CURRENT_MARGIN',
            'error',
            'validation.electrical.escContinuousInsufficient',
            'electrical',
            [escSel.selectionId],
            {
              demand: contPerChannel,
              capacity: esc.engineering.esc.continuousCurrentA,
            },
          ),
        );
      }
      if (burstPerChannel > esc.engineering.esc.burstCurrentA + 1e-9) {
        issues.push(
          issue(
            'ELEC_ESC_BURST_MARGIN',
            'error',
            'validation.electrical.escBurstInsufficient',
            'electrical',
            [escSel.selectionId],
            {
              demand: burstPerChannel,
              capacity: esc.engineering.esc.burstCurrentA,
            },
          ),
        );
      }
      return issues;
    },
  },
  {
    code: 'ELEC_BATTERY_DISCHARGE',
    phase: 'electrical',
    evaluate(ctx): ValidationIssue[] {
      const batt = ctx.assembly.batteryComponent;
      const battSel = ctx.assembly.batterySelection;
      if (!batt || !battSel || batt.engineering.type !== 'battery') return [];
      const capability =
        batt.engineering.battery.capacityAh * batt.engineering.battery.dischargeCRating;
      let nameplateSum = 0;
      for (const s of ctx.assembly.selectionsByType.get('motor') ?? []) {
        const c = ctx.assembly.componentBySelectionId.get(s.selectionId);
        if (!c || c.engineering.type !== 'motor') continue;
        nameplateSum += c.engineering.motor.maxContinuousCurrentA * s.quantity;
      }
      // Realistic continuous pack demand is below all-motors-nameplate simultaneous draw.
      const continuousDemand = nameplateSum * 0.65;
      if (continuousDemand > capability + 1e-9) {
        return [
          issue(
            'ELEC_BATTERY_DISCHARGE',
            'error',
            'validation.electrical.batteryDischargeInsufficient',
            'electrical',
            [battSel.selectionId],
            { demand: continuousDemand, capability, nameplateSum },
          ),
        ];
      }
      if (nameplateSum > capability + 1e-9) {
        return [
          issue(
            'ELEC_BATTERY_DISCHARGE',
            'warning',
            'validation.electrical.batteryDischargeTight',
            'electrical',
            [battSel.selectionId],
            { demand: nameplateSum, capability },
          ),
        ];
      }
      return [];
    },
  },
  {
    code: 'ELEC_NEGATIVE_MARGIN',
    phase: 'electrical',
    evaluate(ctx): ValidationIssue[] {
      // Surfaced when engineering snapshot later provides margins; pre-check via ESC rule above.
      return [];
    },
  },
];

export const rulesetRules: ValidationRule[] = [
  {
    code: 'RULESET_OFFICIAL_ONLY',
    phase: 'pre-engineering-ruleset',
    evaluate(ctx): ValidationIssue[] {
      if (!ctx.policy.requireOfficialCatalog) return [];
      const issues: ValidationIssue[] = [];
      for (const [selId, c] of ctx.assembly.componentBySelectionId) {
        if (!ctx.policy.allowedComponentSources.includes(c.source)) {
          issues.push(
            issue(
              'RULESET_OFFICIAL_ONLY',
              'error',
              'validation.ruleset.sourceNotAllowed',
              'pre-engineering-ruleset',
              [selId],
              { source: c.source },
            ),
          );
        }
      }
      return issues;
    },
  },
  {
    code: 'RULESET_MAX_CELLS',
    phase: 'pre-engineering-ruleset',
    evaluate(ctx): ValidationIssue[] {
      if (ctx.policy.maxCellCount == null) return [];
      const batt = ctx.assembly.batteryComponent;
      const battSel = ctx.assembly.batterySelection;
      if (!batt || !battSel || batt.engineering.type !== 'battery') return [];
      if (batt.engineering.battery.cellCount > ctx.policy.maxCellCount) {
        return [
          issue(
            'RULESET_MAX_CELLS',
            'error',
            'validation.ruleset.maxCells',
            'pre-engineering-ruleset',
            [battSel.selectionId],
            {
              cells: batt.engineering.battery.cellCount,
              max: ctx.policy.maxCellCount,
            },
          ),
        ];
      }
      return [];
    },
  },
  {
    code: 'RULESET_MAX_PROP_DIAMETER',
    phase: 'pre-engineering-ruleset',
    evaluate(ctx): ValidationIssue[] {
      if (ctx.policy.maxPropDiameterM == null) return [];
      const issues: ValidationIssue[] = [];
      for (const s of ctx.assembly.selectionsByType.get('propeller') ?? []) {
        const c = ctx.assembly.componentBySelectionId.get(s.selectionId);
        if (!c || c.engineering.type !== 'propeller') continue;
        const d = c.engineering.propeller.diameterMeters;
        if (d > ctx.policy.maxPropDiameterM + 1e-9) {
          issues.push(
            issue(
              'RULESET_MAX_PROP_DIAMETER',
              'error',
              'validation.ruleset.maxPropDiameter',
              'pre-engineering-ruleset',
              [s.selectionId],
              { diameter: d, max: ctx.policy.maxPropDiameterM },
            ),
          );
        }
      }
      return issues;
    },
  },
  {
    code: 'RULESET_MAX_MASS',
    phase: 'post-engineering',
    evaluate(ctx): ValidationIssue[] {
      if (ctx.policy.maxTakeoffMassKg == null || !ctx.engineering) return [];
      if (ctx.engineering.totalTakeoffMassKg > ctx.policy.maxTakeoffMassKg + 1e-9) {
        return [
          issue(
            'RULESET_MAX_MASS',
            'error',
            'validation.ruleset.maxTakeoffMass',
            'post-engineering',
            [],
            {
              mass: ctx.engineering.totalTakeoffMassKg,
              max: ctx.policy.maxTakeoffMassKg,
            },
          ),
        ];
      }
      return [];
    },
  },
  {
    code: 'RULESET_MIN_TWR',
    phase: 'post-engineering',
    evaluate(ctx): ValidationIssue[] {
      if (!ctx.engineering) return [];
      if (ctx.engineering.thrustToWeight + 1e-9 < ctx.policy.minThrustToWeight) {
        return [
          issue(
            'RULESET_MIN_TWR',
            'error',
            'validation.ruleset.minThrustToWeight',
            'post-engineering',
            [],
            {
              twr: ctx.engineering.thrustToWeight,
              min: ctx.policy.minThrustToWeight,
            },
          ),
        ];
      }
      return [];
    },
  },
];
