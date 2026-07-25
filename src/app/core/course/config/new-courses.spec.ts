import { INDUSTRIAL_SPRINT } from './industrial-sprint.course';
import { COASTAL_RUN } from './coastal-run.course';

describe('new environment courses', () => {
  it('Industrial Sprint has 10–12 valid gates', () => {
    expect(INDUSTRIAL_SPRINT.id).toBe('industrial-sprint');
    expect(INDUSTRIAL_SPRINT.environmentId).toBe('desert-industrial-yard');
    expect(INDUSTRIAL_SPRINT.gates.length).toBeGreaterThanOrEqual(10);
    expect(INDUSTRIAL_SPRINT.gates.length).toBeLessThanOrEqual(12);
    expect(INDUSTRIAL_SPRINT.version).toBe(1);
    for (const gate of INDUSTRIAL_SPRINT.gates) {
      expect(Number.isFinite(gate.position.x)).toBe(true);
      expect(gate.position.y).toBeGreaterThan(0.5);
      expect(gate.width).toBeGreaterThan(0);
    }
  });

  it('Coastal Run has 10 gates on safe plateau heights', () => {
    expect(COASTAL_RUN.id).toBe('coastal-run');
    expect(COASTAL_RUN.environmentId).toBe('coastal-ruins');
    expect(COASTAL_RUN.gates.length).toBe(10);
    for (const gate of COASTAL_RUN.gates) {
      expect(gate.position.y).toBeGreaterThan(1);
      expect(gate.position.y).toBeLessThan(5);
      expect(Math.abs(gate.position.x)).toBeLessThan(80);
    }
  });
});
