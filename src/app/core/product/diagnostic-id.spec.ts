import { createDiagnosticId } from './diagnostic-id';

describe('createDiagnosticId', () => {
  it('returns FPV-XXXX-XXXX format', () => {
    const id = createDiagnosticId('test-seed');
    expect(id).toMatch(/^FPV-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });
});
