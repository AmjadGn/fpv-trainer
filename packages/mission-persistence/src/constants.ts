/**
 * Mission persistence schema and retention constants.
 * Independent of evidence schema and scoring-policy versions.
 */

export const MISSION_PERSISTENCE_SCHEMA_VERSION = '1.0.0' as const;

/** Retain at most this many recent results per mission scope (PB pinned separately). */
export const MISSION_RESULTS_RETENTION_LIMIT = 20;

/** Coastal Ruins Survey has three photography objectives → at most three PB images. */
export const MISSION_BEST_IMAGES_MAX_COUNT = 3;

/** Defensive upper bound on a single presentation image Blob / byte payload. */
export const MISSION_BEST_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB
