import type { ValidationContext, ValidationIssue, ValidationRule } from '../domain/types';

function issue(
  ruleCode: string,
  severity: ValidationIssue['severity'],
  messageKey: string,
  relatedSelectionIds: string[] = [],
  parameters: Record<string, string | number | boolean> = {},
  affectedPath = 'build',
  remediationKeys: string[] = [],
): ValidationIssue {
  return {
    ruleCode,
    severity,
    messageKey,
    relatedSelectionIds,
    parameters,
    affectedPath,
    remediationKeys,
  };
}

export const structuralRules: ValidationRule[] = [
  {
    code: 'STRUCT_FRAME_REQUIRED',
    phase: 'structural',
    evaluate(ctx: ValidationContext): ValidationIssue[] {
      const frames = ctx.revision.selections.filter((s) => {
        const c = ctx.components.get(s.componentRevisionId);
        return c?.componentType === 'frame';
      });
      if (frames.length === 0) {
        return [
          issue(
            'STRUCT_FRAME_REQUIRED',
            'fatal',
            'validation.structural.frameRequired',
            [],
            {},
            'selections',
            ['remediation.addFrame'],
          ),
        ];
      }
      if (frames.length > 1) {
        return [
          issue(
            'STRUCT_FRAME_REQUIRED',
            'error',
            'validation.structural.multipleFrames',
            frames.map((f) => f.selectionId),
          ),
        ];
      }
      return [];
    },
  },
  {
    code: 'STRUCT_MOTORS_COUNT',
    phase: 'structural',
    evaluate(ctx): ValidationIssue[] {
      const motors = ctx.revision.selections.filter((s) => {
        const c = ctx.components.get(s.componentRevisionId);
        return c?.componentType === 'motor';
      });
      if (motors.length !== 4) {
        return [
          issue(
            'STRUCT_MOTORS_COUNT',
            'error',
            'validation.structural.motorsCount',
            motors.map((m) => m.selectionId),
            { expected: 4, actual: motors.length },
            'selections.motors',
            ['remediation.setFourMotors'],
          ),
        ];
      }
      return [];
    },
  },
  {
    code: 'STRUCT_PROP_PER_MOTOR',
    phase: 'structural',
    evaluate(ctx): ValidationIssue[] {
      const motors = ctx.revision.selections.filter((s) => {
        const c = ctx.components.get(s.componentRevisionId);
        return c?.componentType === 'motor';
      });
      const props = ctx.revision.selections.filter((s) => {
        const c = ctx.components.get(s.componentRevisionId);
        return c?.componentType === 'propeller';
      });
      if (props.length !== motors.length) {
        return [
          issue(
            'STRUCT_PROP_PER_MOTOR',
            'error',
            'validation.structural.propPerMotor',
            [],
            { motors: motors.length, propellers: props.length },
          ),
        ];
      }
      return [];
    },
  },
  {
    code: 'STRUCT_BATTERY_REQUIRED',
    phase: 'structural',
    evaluate(ctx): ValidationIssue[] {
      const batteries = ctx.revision.selections.filter((s) => {
        const c = ctx.components.get(s.componentRevisionId);
        return c?.componentType === 'battery';
      });
      if (batteries.length === 0) {
        return [
          issue(
            'STRUCT_BATTERY_REQUIRED',
            'fatal',
            'validation.structural.batteryRequired',
            [],
            {},
            'selections.battery',
            ['remediation.addBattery'],
          ),
        ];
      }
      return [];
    },
  },
  {
    code: 'STRUCT_ESC_REQUIRED',
    phase: 'structural',
    evaluate(ctx): ValidationIssue[] {
      const escs = ctx.revision.selections.filter((s) => {
        const c = ctx.components.get(s.componentRevisionId);
        return c?.componentType === 'esc';
      });
      if (escs.length === 0) {
        return [
          issue(
            'STRUCT_ESC_REQUIRED',
            'error',
            'validation.structural.escRequired',
          ),
        ];
      }
      return [];
    },
  },
  {
    code: 'STRUCT_DUPLICATE_SLOTS',
    phase: 'structural',
    evaluate(ctx): ValidationIssue[] {
      const seen = new Map<string, string>();
      const issues: ValidationIssue[] = [];
      for (const s of ctx.revision.selections) {
        const prev = seen.get(s.slotId);
        if (prev) {
          issues.push(
            issue(
              'STRUCT_DUPLICATE_SLOTS',
              'error',
              'validation.structural.duplicateSlot',
              [prev, s.selectionId],
              { slotId: s.slotId },
            ),
          );
        } else {
          seen.set(s.slotId, s.selectionId);
        }
      }
      return issues;
    },
  },
  {
    code: 'STRUCT_MISSING_REVISION',
    phase: 'structural',
    evaluate(ctx): ValidationIssue[] {
      const issues: ValidationIssue[] = [];
      for (const s of ctx.revision.selections) {
        if (!ctx.components.has(s.componentRevisionId)) {
          issues.push(
            issue(
              'STRUCT_MISSING_REVISION',
              'fatal',
              'validation.structural.missingRevision',
              [s.selectionId],
              { revisionId: s.componentRevisionId },
            ),
          );
        }
      }
      return issues;
    },
  },
];

export const mechanicalRules: ValidationRule[] = [
  {
    code: 'MECH_MOTOR_MOUNT_PATTERN',
    phase: 'mechanical',
    evaluate(ctx): ValidationIssue[] {
      const frameSel = ctx.revision.selections.find((s) => {
        const c = ctx.components.get(s.componentRevisionId);
        return c?.componentType === 'frame';
      });
      if (!frameSel) return [];
      const frame = ctx.components.get(frameSel.componentRevisionId);
      if (!frame || frame.engineering.type !== 'frame') return [];
      const pattern = frame.engineering.frame.motorMountPattern;
      const issues: ValidationIssue[] = [];
      for (const s of ctx.revision.selections) {
        const c = ctx.components.get(s.componentRevisionId);
        if (c?.componentType !== 'motor') continue;
        if (!c.mountingPatterns.includes(pattern)) {
          issues.push(
            issue(
              'MECH_MOTOR_MOUNT_PATTERN',
              'error',
              'validation.mechanical.motorMountMismatch',
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
      const frameSel = ctx.revision.selections.find((s) => {
        const c = ctx.components.get(s.componentRevisionId);
        return c?.componentType === 'frame';
      });
      if (!frameSel) return [];
      const frame = ctx.components.get(frameSel.componentRevisionId);
      if (!frame || frame.engineering.type !== 'frame') return [];
      const { supportedPropDiameterMinM, supportedPropDiameterMaxM } =
        frame.engineering.frame;
      const issues: ValidationIssue[] = [];
      for (const s of ctx.revision.selections) {
        const c = ctx.components.get(s.componentRevisionId);
        if (!c || c.engineering.type !== 'propeller') continue;
        const d = c.engineering.propeller.diameterMeters;
        if (d < supportedPropDiameterMinM || d > supportedPropDiameterMaxM) {
          issues.push(
            issue(
              'MECH_PROP_CLEARANCE',
              'error',
              'validation.mechanical.propClearance',
              [s.selectionId],
              {
                diameter: d,
                min: supportedPropDiameterMinM,
                max: supportedPropDiameterMaxM,
              },
            ),
          );
        }
      }
      return issues;
    },
  },
];

export const electricalRules: ValidationRule[] = [
  {
    code: 'ELEC_VOLTAGE_COMPAT',
    phase: 'electrical',
    evaluate(ctx): ValidationIssue[] {
      const battSel = ctx.revision.selections.find((s) => {
        const c = ctx.components.get(s.componentRevisionId);
        return c?.componentType === 'battery';
      });
      if (!battSel) return [];
      const batt = ctx.components.get(battSel.componentRevisionId);
      if (!batt || batt.engineering.type !== 'battery') return [];
      const vNom = batt.engineering.battery.nominalVoltage;
      const issues: ValidationIssue[] = [];
      for (const s of ctx.revision.selections) {
        const c = ctx.components.get(s.componentRevisionId);
        if (!c) continue;
        if (c.engineering.type === 'motor') {
          const { voltageMin, voltageMax } = c.engineering.motor;
          if (vNom < voltageMin || vNom > voltageMax) {
            issues.push(
              issue(
                'ELEC_VOLTAGE_COMPAT',
                'error',
                'validation.electrical.motorVoltage',
                [s.selectionId, battSel.selectionId],
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
                [s.selectionId, battSel.selectionId],
                { voltage: vNom, min: voltageMin, max: voltageMax },
              ),
            );
          }
        }
      }
      return issues;
    },
  },
];

export const rulesetRules: ValidationRule[] = [
  {
    code: 'RULESET_OFFICIAL_ONLY',
    phase: 'ruleset',
    evaluate(ctx): ValidationIssue[] {
      if (!ctx.policy.requireOfficialCatalog) return [];
      const issues: ValidationIssue[] = [];
      for (const s of ctx.revision.selections) {
        const c = ctx.components.get(s.componentRevisionId);
        if (!c) continue;
        if (!ctx.policy.allowedComponentSources.includes(c.source)) {
          issues.push(
            issue(
              'RULESET_OFFICIAL_ONLY',
              'error',
              'validation.ruleset.sourceNotAllowed',
              [s.selectionId],
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
    phase: 'ruleset',
    evaluate(ctx): ValidationIssue[] {
      if (ctx.policy.maxCellCount == null) return [];
      const battSel = ctx.revision.selections.find((s) => {
        const c = ctx.components.get(s.componentRevisionId);
        return c?.componentType === 'battery';
      });
      if (!battSel) return [];
      const batt = ctx.components.get(battSel.componentRevisionId);
      if (!batt || batt.engineering.type !== 'battery') return [];
      if (batt.engineering.battery.cellCount > ctx.policy.maxCellCount) {
        return [
          issue(
            'RULESET_MAX_CELLS',
            'error',
            'validation.ruleset.maxCells',
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
];
