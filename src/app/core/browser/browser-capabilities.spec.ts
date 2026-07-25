import { detectBrowserCapabilities } from './browser-capabilities';

describe('detectBrowserCapabilities', () => {
  it('returns a structured result in jsdom', () => {
    const result = detectBrowserCapabilities(window);
    expect(result.status === 'fully-supported'
      || result.status === 'supported-with-limitations'
      || result.status === 'unsupported').toBe(true);
    expect(Array.isArray(result.limitations)).toBe(true);
    expect(Array.isArray(result.blockers)).toBe(true);
  });
});
