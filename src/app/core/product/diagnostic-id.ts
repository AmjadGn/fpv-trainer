/** Short alpha diagnostic identifier, e.g. FPV-A1B2-C3D4 */
export function createDiagnosticId(seed?: string): string {
  const source =
    seed ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  const a = ((hash >>> 16) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const b = (hash & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `FPV-${a.slice(0, 4)}-${b.slice(0, 4)}`;
}
