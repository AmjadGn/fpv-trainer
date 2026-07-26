/**
 * Provenance metadata: where a location's real-world inspiration and/or
 * assets came from, and under what license. Purely descriptive — this
 * package does not enforce licensing rules, only carries the record.
 */

import type { ProvenanceRecordId } from './ids';

export interface ProvenanceRecord {
  readonly id: ProvenanceRecordId;
  readonly sourceAttribution: string;
  readonly licenseId: string;
  readonly realWorldInspirationNote?: string;
  readonly usageNotes?: string;
}
