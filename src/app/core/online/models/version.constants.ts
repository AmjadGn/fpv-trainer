export const CLIENT_BUILD_VERSION = '1.0.0-alpha.1';
/** Competitive physics stack — bump when collision response / flight integration changes. */
export const PHYSICS_VERSION = '1.1.0';
export const REPLAY_VERSION = 3;
export const CATALOG_VERSION = 1;
export const LEADERBOARD_RULES_VERSION = 1;
export const SUBMISSION_VERSION = 1;

/** Re-export collision version stamps for submissions / UI. */
export {
  COLLISION_MODEL_VERSION,
  COLLIDER_MANIFEST_VERSION,
  DRONE_COLLIDER_VERSION,
  ENVIRONMENT_ART_VERSION,
  PHYSICS_ENGINE_VERSION,
  PHYSICS_STACK_VERSION,
} from '../../physics/config/physics-versions';
