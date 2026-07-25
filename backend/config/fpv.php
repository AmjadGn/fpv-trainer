<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Version pins
    |--------------------------------------------------------------------------
    |
    | These must stay aligned with shared/catalog/manifest.json and the
    | Angular client's version.constants.ts. The backend rejects submissions
    | that reference an unsupported physics/replay/submission version.
    */
    'catalog_version' => (int) env('FPV_CATALOG_VERSION', 1),
    'physics_version' => env('FPV_PHYSICS_VERSION', '1.1.0'),
    'supported_physics_versions' => array_filter(explode(',', env('FPV_SUPPORTED_PHYSICS_VERSIONS', '1.0.0,1.1.0'))),
    'replay_version' => (int) env('FPV_REPLAY_VERSION', 3),
    'submission_version' => (int) env('FPV_SUBMISSION_VERSION', 1),
    'leaderboard_rules_version' => (int) env('FPV_LEADERBOARD_RULES_VERSION', 1),
    'client_build_version' => env('FPV_CLIENT_BUILD_VERSION', '0.8.0'),
    'collision_model_version' => env('FPV_COLLISION_MODEL_VERSION', '1.0.0'),
    'collider_manifest_version' => env('FPV_COLLIDER_MANIFEST_VERSION', '1.0.0'),
    'environment_art_version' => env('FPV_ENVIRONMENT_ART_VERSION', '1.0.0'),
    'drone_collider_version' => env('FPV_DRONE_COLLIDER_VERSION', '1.0.0'),
    'physics_engine_version' => env('FPV_PHYSICS_ENGINE_VERSION', 'rapier-0.14.0'),

    /*
    |--------------------------------------------------------------------------
    | Catalog source
    |--------------------------------------------------------------------------
    |
    | Absolute path to the shared JSON catalog. Defaults to the monorepo
    | ../shared/catalog directory relative to the backend app root.
    */
    'catalog_path' => env('FPV_CATALOG_PATH') ?: base_path('../shared/catalog'),

    /*
    |--------------------------------------------------------------------------
    | Frontend / CORS
    |--------------------------------------------------------------------------
    */
    'frontend_url' => env('FRONTEND_URL', 'http://localhost:4200'),
    'app_public_url' => env('FPV_APP_PUBLIC_URL', env('FRONTEND_URL', 'http://localhost:4200')),

    /*
    |--------------------------------------------------------------------------
    | Race session / submission limits
    |--------------------------------------------------------------------------
    */
    'race_session_ttl_minutes' => (int) env('FPV_RACE_SESSION_TTL_MINUTES', 15),
    'max_splits_per_run' => (int) env('FPV_MAX_SPLITS_PER_RUN', 64),
    'max_replay_frames' => (int) env('FPV_MAX_REPLAY_FRAMES', 20000),
    'max_replay_bytes' => (int) env('FPV_MAX_REPLAY_BYTES', 2 * 1024 * 1024),
    'max_events_per_run' => (int) env('FPV_MAX_EVENTS_PER_RUN', 512),

    /*
    |--------------------------------------------------------------------------
    | Anti-cheat thresholds
    |--------------------------------------------------------------------------
    |
    | Conservative heuristics used by RunVerificationService. These are
    | signals, not proof — see docs/competitive-integrity.md for limitations.
    */
    'anticheat' => [
        'max_speed_mps' => (float) env('FPV_ANTICHEAT_MAX_SPEED_MPS', 60.0),
        'max_teleport_distance_m' => (float) env('FPV_ANTICHEAT_MAX_TELEPORT_M', 25.0),
        'max_altitude_m' => (float) env('FPV_ANTICHEAT_MAX_ALTITUDE_M', 500.0),
        'min_altitude_m' => (float) env('FPV_ANTICHEAT_MIN_ALTITUDE_M', -50.0),
        'suspicion_manual_review_threshold' => (int) env('FPV_ANTICHEAT_MANUAL_REVIEW_THRESHOLD', 40),
        'suspicion_reject_threshold' => (int) env('FPV_ANTICHEAT_REJECT_THRESHOLD', 80),
    ],

    /*
    |--------------------------------------------------------------------------
    | Rate limits (requests per minute unless noted)
    |--------------------------------------------------------------------------
    */
    'rate_limits' => [
        'auth' => (int) env('FPV_RATE_LIMIT_AUTH', 10),
        'submissions' => (int) env('FPV_RATE_LIMIT_SUBMISSIONS', 30),
        'invites' => (int) env('FPV_RATE_LIMIT_INVITES', 10),
        'notifications' => (int) env('FPV_RATE_LIMIT_NOTIFICATIONS', 60),
        'default_api' => (int) env('FPV_RATE_LIMIT_API', 120),
    ],

    /*
    |--------------------------------------------------------------------------
    | Challenge rotation
    |--------------------------------------------------------------------------
    */
    'challenge_rotation_path' => env('FPV_CHALLENGE_ROTATION_PATH') ?: base_path('../shared/catalog/challenge-rotation.json'),

    /*
    |--------------------------------------------------------------------------
    | Beta access
    |--------------------------------------------------------------------------
    */
    'beta' => [
        'mode' => env('FPV_BETA_ACCESS_MODE', 'closed'), // closed|invite_only|open_registration|maintenance
        'invite_code_required' => (bool) env('FPV_BETA_INVITE_CODE_REQUIRED', false),
        'allow_email_domains' => array_filter(explode(',', env('FPV_BETA_ALLOW_EMAIL_DOMAINS', ''))),
    ],

    'feature_flags' => [
        'cache_ttl_seconds' => (int) env('FPV_FEATURE_FLAG_CACHE_TTL', 60),
    ],

    'season' => [
        'rating_daily_cap' => (int) env('FPV_SEASON_RATING_DAILY_CAP', 200),
    ],

    'ghost_events' => [
        'max_visible_ghosts' => (int) env('FPV_GHOST_MAX_VISIBLE', 8),
    ],

    /*
    |--------------------------------------------------------------------------
    | Reserved usernames
    |--------------------------------------------------------------------------
    */
    'reserved_usernames' => [
        'admin', 'root', 'administrator', 'moderator', 'support', 'staff',
        'fpv-trainer', 'fpvtrainer', 'system', 'api', 'null', 'undefined',
        'me', 'you', 'help', 'security', 'official', 'test',
    ],
];
