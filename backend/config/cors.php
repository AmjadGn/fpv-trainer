<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | The Angular client (localhost:4200) and the Laravel API (localhost:8000)
    | run on separate origins. Auth uses Sanctum Bearer tokens (Authorization
    | header), not cookies, so `supports_credentials` stays false and no
    | stateful-domain cookie dance is required for the primary flow.
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter(array_map('trim', explode(',', env(
        'FPV_CORS_ALLOWED_ORIGINS',
        env('FRONTEND_URL', 'http://localhost:4200')
    )))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
