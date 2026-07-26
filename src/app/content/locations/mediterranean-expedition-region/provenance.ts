import {
  asProvenanceRecordId,
  type ProvenanceRecord,
} from '@fpv/location-domain';

import { PROVENANCE_IDS } from './identity';

/**
 * Package provenance — repository-owned proxy content.
 * Does not claim final production art or real-world site fidelity.
 */
export const MEDITERRANEAN_PROVENANCE_RECORDS: readonly ProvenanceRecord[] = [
  {
    id: asProvenanceRecordId(PROVENANCE_IDS.package),
    sourceAttribution: 'FPV Simulator repository — Mediterranean Expedition Region package',
    licenseId: 'proprietary-fpv-simulator',
    realWorldInspirationNote:
      'Fictionalized Mediterranean coastal cliffs and ruins. Not a copy of any real-world site.',
    usageNotes: 'Internal curated location package for v1.3.0 photography missions.',
  },
  {
    id: asProvenanceRecordId(PROVENANCE_IDS.proxyGeometry),
    sourceAttribution: 'Repository-authored procedural/primitive proxy geometry',
    licenseId: 'proprietary-fpv-simulator',
    usageNotes:
      'Proxy-quality Three.js primitives and simplified Rapier colliders. Not photogrammetry; not final art.',
  },
];
