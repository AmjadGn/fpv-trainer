import {
  issue,
  type ValidationContext,
  type ValidationIssue,
  type ValidationRule,
} from '../domain/types';

export const resolutionRules: ValidationRule[] = [
  {
    code: 'RES_FROM_ASSEMBLY',
    phase: 'resolution',
    evaluate(ctx: ValidationContext): ValidationIssue[] {
      return ctx.assembly.diagnostics.map((d) =>
        issue(
          d.code,
          d.severity,
          d.messageKey,
          'resolution',
          [...d.relatedSelectionIds],
          { ...d.parameters },
          'resolution',
        ),
      );
    },
  },
  {
    code: 'RES_DUPLICATE_SLOTS',
    phase: 'resolution',
    evaluate(ctx): ValidationIssue[] {
      const seen = new Map<string, string>();
      const issues: ValidationIssue[] = [];
      for (const s of ctx.revision.selections) {
        const prev = seen.get(s.slotId);
        if (prev) {
          issues.push(
            issue(
              'RES_DUPLICATE_SLOTS',
              'error',
              'validation.resolution.duplicateSlot',
              'resolution',
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
];

export const structuralRules: ValidationRule[] = [
  {
    code: 'STRUCT_FRAME_REQUIRED',
    phase: 'structural',
    evaluate(ctx): ValidationIssue[] {
      const frames = ctx.assembly.selectionsByType.get('frame') ?? [];
      if (frames.length === 0) {
        return [
          issue(
            'STRUCT_FRAME_REQUIRED',
            'fatal',
            'validation.structural.frameRequired',
            'structural',
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
            'structural',
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
      const expected = ctx.assembly.expectedMotorCount;
      if (expected == null) return [];
      const motors = ctx.assembly.selectionsByType.get('motor') ?? [];
      if (motors.length !== expected) {
        return [
          issue(
            'STRUCT_MOTORS_COUNT',
            'error',
            'validation.structural.motorsCount',
            'structural',
            motors.map((m) => m.selectionId),
            { expected, actual: motors.length },
            'selections.motors',
            ['remediation.setExpectedMotors'],
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
      const batteries = ctx.assembly.selectionsByType.get('battery') ?? [];
      if (batteries.length === 0) {
        return [
          issue(
            'STRUCT_BATTERY_REQUIRED',
            'fatal',
            'validation.structural.batteryRequired',
            'structural',
            [],
            {},
            'selections.battery',
            ['remediation.addBattery'],
          ),
        ];
      }
      if (batteries.length > 1) {
        return [
          issue(
            'STRUCT_BATTERY_COUNT',
            'error',
            'validation.structural.multipleBatteries',
            'structural',
            batteries.map((b) => b.selectionId),
          ),
        ];
      }
      return [];
    },
  },
  {
    code: 'STRUCT_SUPPORTED_ARCHETYPE',
    phase: 'structural',
    evaluate(ctx): ValidationIssue[] {
      /**
       * v1.1.1 topology scope: supported multirotor X-quad only.
       * expectedMotorCount is derived from frame.armPositions.length; community
       * frames cannot opt into hex/octo by inventing arm counts — unsupported
       * counts fail explicitly rather than compiling with fallbacks.
       */
      const expected = ctx.assembly.expectedMotorCount;
      if (expected == null) return [];
      if (expected !== 4) {
        return [
          issue(
            'STRUCT_SUPPORTED_ARCHETYPE',
            'error',
            'validation.structural.unsupportedTopology',
            'structural',
            ctx.assembly.frameSelection
              ? [ctx.assembly.frameSelection.selectionId]
              : [],
            {
              expectedMotorCount: expected,
              supportedArchetype: 'x-quad-4',
              topologyScope: 'v1.1.1-multirotor-x-quad',
            },
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
      if (ctx.assembly.escSelections.length === 0) {
        return [
          issue(
            'STRUCT_ESC_REQUIRED',
            'error',
            'validation.structural.escRequired',
            'structural',
          ),
        ];
      }
      return [];
    },
  },
];

function hasEdge(
  topology: readonly { fromSelectionId: string; toSelectionId: string; kind: string }[],
  from: string,
  to: string,
  kind: string,
): boolean {
  return topology.some(
    (e) => e.fromSelectionId === from && e.toSelectionId === to && e.kind === kind,
  );
}

export const topologyRules: ValidationRule[] = [
  {
    code: 'TOPO_ENDPOINTS',
    phase: 'topology',
    evaluate(ctx): ValidationIssue[] {
      const issues: ValidationIssue[] = [];
      const ids = ctx.assembly.selectionById;
      for (const e of ctx.revision.topology) {
        if (!ids.has(e.fromSelectionId) || !ids.has(e.toSelectionId)) {
          issues.push(
            issue(
              'TOPO_ENDPOINTS',
              'error',
              'validation.topology.invalidEndpoint',
              'topology',
              [e.fromSelectionId, e.toSelectionId],
              { kind: e.kind },
            ),
          );
        }
        if (e.fromSelectionId === e.toSelectionId) {
          issues.push(
            issue(
              'TOPO_SELF_EDGE',
              'error',
              'validation.topology.selfReference',
              'topology',
              [e.fromSelectionId],
              { kind: e.kind },
            ),
          );
        }
      }
      return issues;
    },
  },
  {
    code: 'TOPO_DUPLICATE_EDGES',
    phase: 'topology',
    evaluate(ctx): ValidationIssue[] {
      const seen = new Set<string>();
      const issues: ValidationIssue[] = [];
      for (const e of ctx.revision.topology) {
        const key = `${e.kind}:${e.fromSelectionId}->${e.toSelectionId}`;
        if (seen.has(key)) {
          issues.push(
            issue(
              'TOPO_DUPLICATE_EDGES',
              'error',
              'validation.topology.duplicateEdge',
              'topology',
              [e.fromSelectionId, e.toSelectionId],
              { kind: e.kind },
            ),
          );
        }
        seen.add(key);
      }
      return issues;
    },
  },
  {
    code: 'TOPO_PROPULSION_BIJECTIVE',
    phase: 'topology',
    evaluate(ctx): ValidationIssue[] {
      const issues: ValidationIssue[] = [];
      const motors = ctx.assembly.selectionsByType.get('motor') ?? [];
      const props = ctx.assembly.selectionsByType.get('propeller') ?? [];
      const units = ctx.assembly.propulsionUnits;

      if (units.length !== motors.length || units.length !== props.length) {
        issues.push(
          issue(
            'TOPO_PROPULSION_BIJECTIVE',
            'error',
            'validation.topology.propulsionNotBijective',
            'topology',
            [],
            {
              motors: motors.length,
              propellers: props.length,
              units: units.length,
            },
          ),
        );
      }

      for (const m of motors) {
        const count = units.filter((u) => u.motorSelection.selectionId === m.selectionId)
          .length;
        if (count === 0) {
          issues.push(
            issue(
              'TOPO_MOTOR_WITHOUT_PROP',
              'error',
              'validation.topology.motorWithoutPropeller',
              'topology',
              [m.selectionId],
            ),
          );
        } else if (count > 1) {
          issues.push(
            issue(
              'TOPO_MULTI_PROP_MOTOR',
              'error',
              'validation.topology.multiplePropsPerMotor',
              'topology',
              [m.selectionId],
              { count },
            ),
          );
        }
      }
      for (const p of props) {
        const count = units.filter(
          (u) => u.propellerSelection.selectionId === p.selectionId,
        ).length;
        if (count === 0) {
          issues.push(
            issue(
              'TOPO_PROP_WITHOUT_MOTOR',
              'error',
              'validation.topology.propellerWithoutMotor',
              'topology',
              [p.selectionId],
            ),
          );
        }
      }
      return issues;
    },
  },
  {
    code: 'TOPO_MOTOR_MOUNTED',
    phase: 'topology',
    evaluate(ctx): ValidationIssue[] {
      const frameId = ctx.assembly.frameSelection?.selectionId;
      if (!frameId) return [];
      const issues: ValidationIssue[] = [];
      for (const m of ctx.assembly.selectionsByType.get('motor') ?? []) {
        if (!hasEdge(ctx.revision.topology, m.selectionId, frameId, 'mounts-on')) {
          issues.push(
            issue(
              'TOPO_MOTOR_MOUNTED',
              'error',
              'validation.topology.motorNotMounted',
              'topology',
              [m.selectionId],
            ),
          );
        }
      }
      return issues;
    },
  },
  {
    code: 'TOPO_ESC_CONTROLS',
    phase: 'topology',
    evaluate(ctx): ValidationIssue[] {
      const escs = ctx.assembly.escSelections;
      if (escs.length === 0) return [];
      const issues: ValidationIssue[] = [];
      for (const m of ctx.assembly.selectionsByType.get('motor') ?? []) {
        const controlled = escs.some((esc) =>
          hasEdge(ctx.revision.topology, esc.selectionId, m.selectionId, 'controls'),
        );
        if (!controlled) {
          issues.push(
            issue(
              'TOPO_ESC_CONTROLS',
              'error',
              'validation.topology.motorNotControlled',
              'topology',
              [m.selectionId],
            ),
          );
        }
      }
      return issues;
    },
  },
  {
    code: 'TOPO_BATTERY_POWERS_ESC',
    phase: 'topology',
    evaluate(ctx): ValidationIssue[] {
      const batt = ctx.assembly.batterySelection;
      if (!batt) return [];
      const issues: ValidationIssue[] = [];
      for (const esc of ctx.assembly.escSelections) {
        if (
          !hasEdge(ctx.revision.topology, batt.selectionId, esc.selectionId, 'powers')
        ) {
          issues.push(
            issue(
              'TOPO_BATTERY_POWERS_ESC',
              'error',
              'validation.topology.batteryMustPowerEsc',
              'topology',
              [batt.selectionId, esc.selectionId],
            ),
          );
        }
      }
      return issues;
    },
  },
  {
    code: 'TOPO_BATTERY_POWERS_AVIONICS',
    phase: 'topology',
    evaluate(ctx): ValidationIssue[] {
      const batt = ctx.assembly.batterySelection;
      if (!batt) return [];
      const issues: ValidationIssue[] = [];
      const requiredTypes = [
        'flight-controller',
        'camera',
        'video-transmitter',
        'receiver',
      ] as const;
      for (const type of requiredTypes) {
        for (const sel of ctx.assembly.selectionsByType.get(type) ?? []) {
          if (
            !hasEdge(
              ctx.revision.topology,
              batt.selectionId,
              sel.selectionId,
              'powers',
            )
          ) {
            issues.push(
              issue(
                'TOPO_BATTERY_POWERS_AVIONICS',
                'error',
                'validation.topology.batteryMustPowerElectronics',
                'topology',
                [batt.selectionId, sel.selectionId],
                { componentType: type },
              ),
            );
          }
        }
      }
      return issues;
    },
  },
  {
    code: 'TOPO_NO_POWER_CYCLES',
    phase: 'topology',
    evaluate(ctx): ValidationIssue[] {
      // Detect cycles in powers/controls directed graphs.
      const kinds = new Set(['powers', 'controls', 'mounts-on']);
      const adj = new Map<string, string[]>();
      for (const e of ctx.revision.topology) {
        if (!kinds.has(e.kind)) continue;
        const list = adj.get(e.fromSelectionId) ?? [];
        list.push(e.toSelectionId);
        adj.set(e.fromSelectionId, list);
      }
      const visiting = new Set<string>();
      const visited = new Set<string>();
      let cyclic = false;
      const dfs = (n: string): void => {
        if (cyclic) return;
        if (visiting.has(n)) {
          cyclic = true;
          return;
        }
        if (visited.has(n)) return;
        visiting.add(n);
        for (const next of adj.get(n) ?? []) dfs(next);
        visiting.delete(n);
        visited.add(n);
      };
      for (const id of ctx.assembly.selectionById.keys()) dfs(id);
      if (!cyclic) return [];
      return [
        issue(
          'TOPO_NO_POWER_CYCLES',
          'error',
          'validation.topology.unsupportedCycle',
          'topology',
        ),
      ];
    },
  },
];
