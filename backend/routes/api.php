<?php

use App\Http\Controllers\Api\V1\Admin\AdminChallengeController;
use App\Http\Controllers\Api\V1\Admin\AdminBetaInviteController;
use App\Http\Controllers\Api\V1\Admin\AdminFeatureFlagController;
use App\Http\Controllers\Api\V1\Admin\AdminGhostEventController;
use App\Http\Controllers\Api\V1\Admin\AdminLeaderboardIntegrityController;
use App\Http\Controllers\Api\V1\Admin\AdminReviewQueueController;
use App\Http\Controllers\Api\V1\Admin\AdminRunController;
use App\Http\Controllers\Api\V1\Admin\AdminSeasonController;
use App\Http\Controllers\Api\V1\Admin\AdminSystemHealthController;
use App\Http\Controllers\Api\V1\Admin\AdminTournamentController;
use App\Http\Controllers\Api\V1\Admin\AdminUserController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CatalogController;
use App\Http\Controllers\Api\V1\ChallengeController;
use App\Http\Controllers\Api\V1\CosmeticController;
use App\Http\Controllers\Api\V1\EntitlementController;
use App\Http\Controllers\Api\V1\FeatureController;
use App\Http\Controllers\Api\V1\GhostEventController;
use App\Http\Controllers\Api\V1\LeaderboardController;
use App\Http\Controllers\Api\V1\MissionController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\PilotController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\ProgressController;
use App\Http\Controllers\Api\V1\RaceSessionController;
use App\Http\Controllers\Api\V1\RaceSubmissionController;
use App\Http\Controllers\Api\V1\ShareController;
use App\Http\Controllers\Api\V1\SeasonController;
use App\Http\Controllers\Api\V1\TournamentController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->middleware('throttle:api')->group(function () {

    // ------------------------------------------------------------------
    // Auth
    // ------------------------------------------------------------------
    Route::prefix('auth')->middleware('throttle:auth')->group(function () {
        Route::post('/register', [AuthController::class, 'register']);
        Route::post('/login', [AuthController::class, 'login']);
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
        Route::post('/reset-password', [AuthController::class, 'resetPassword']);

        Route::middleware('auth:sanctum')->group(function () {
            Route::post('/logout', [AuthController::class, 'logout']);
            Route::get('/me', [AuthController::class, 'me']);
        });
    });

    // ------------------------------------------------------------------
    // Catalog (public, read-only)
    // ------------------------------------------------------------------
    Route::prefix('catalog')->group(function () {
        Route::get('/', [CatalogController::class, 'manifest']);
        Route::get('/environments', [CatalogController::class, 'environments']);
        Route::get('/courses', [CatalogController::class, 'courses']);
        Route::get('/weather-presets', [CatalogController::class, 'weatherPresets']);
    });

    // ------------------------------------------------------------------
    // Public sharing (no auth)
    // ------------------------------------------------------------------
    Route::prefix('public')->group(function () {
        Route::get('/results/{publicId}', [ShareController::class, 'publicResult']);
        Route::get('/replays/{publicId}', [ShareController::class, 'publicReplay']);
    });

    // ------------------------------------------------------------------
    // Public pilot profiles / leaderboards / challenge browsing
    // ------------------------------------------------------------------
    Route::get('/pilots/{username}', [PilotController::class, 'show']);
    Route::get('/leaderboards/courses/{courseId}', [LeaderboardController::class, 'forCourse']);
    Route::get('/challenges/active', [ChallengeController::class, 'active']);
    Route::get('/challenges/{slug}', [ChallengeController::class, 'show']);
    Route::get('/challenges/{slug}/leaderboard', [ChallengeController::class, 'leaderboard']);
    Route::get('/features', [FeatureController::class, 'index']);
    Route::get('/seasons/current', [SeasonController::class, 'current']);
    Route::get('/seasons/history', [SeasonController::class, 'history']);
    Route::get('/seasons/{slug}', [SeasonController::class, 'show']);
    Route::get('/seasons/{slug}/leaderboard', [SeasonController::class, 'leaderboard']);
    Route::get('/seasons/{slug}/divisions', [SeasonController::class, 'divisions']);
    Route::get('/tournaments', [TournamentController::class, 'index']);
    Route::get('/tournaments/{slug}', [TournamentController::class, 'show']);
    Route::get('/tournaments/{slug}/leaderboard', [TournamentController::class, 'leaderboard']);
    Route::get('/ghost-events', [GhostEventController::class, 'index']);
    Route::get('/ghost-events/{slug}', [GhostEventController::class, 'show']);
    Route::get('/ghost-events/{slug}/bundle', [GhostEventController::class, 'bundle']);

    // ------------------------------------------------------------------
    // Authenticated pilot routes
    // ------------------------------------------------------------------
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/profile', [ProfileController::class, 'show']);
        Route::patch('/profile', [ProfileController::class, 'update']);
        Route::post('/profile/export', [ProfileController::class, 'export']);
        Route::delete('/profile', [ProfileController::class, 'destroy']);
        Route::get('/profile/runs', [PilotController::class, 'runs']);

        Route::get('/progress', [ProgressController::class, 'show']);
        Route::post('/progress/merge', [ProgressController::class, 'merge']);
        Route::post('/progress/sync', [ProgressController::class, 'sync']);

        Route::middleware('throttle:submissions')->group(function () {
            Route::post('/race-sessions', [RaceSessionController::class, 'store']);
            Route::post('/race-submissions', [RaceSubmissionController::class, 'store']);
            Route::post('/challenges/{slug}/sessions', [ChallengeController::class, 'createSession']);
            Route::post('/challenges/{slug}/submissions', [ChallengeController::class, 'submit']);
        });

        Route::get('/race-submissions/{submissionId}', [RaceSubmissionController::class, 'show']);

        Route::get('/leaderboards/around-me', [LeaderboardController::class, 'aroundMe']);
        Route::post('/seasons/{slug}/join', [SeasonController::class, 'join']);
        Route::get('/seasons/{slug}/me', [SeasonController::class, 'me']);
        Route::get('/seasons/{slug}/missions', [SeasonController::class, 'missions']);
        Route::get('/seasons/{slug}/rewards', [SeasonController::class, 'rewards']);
        Route::get('/missions', [MissionController::class, 'index']);
        Route::get('/missions/{mission}', [MissionController::class, 'show']);
        Route::post('/tournaments/{slug}/register', [TournamentController::class, 'register']);
        Route::post('/tournaments/{slug}/sessions', [TournamentController::class, 'createSession']);
        Route::post('/tournaments/{slug}/submissions', [TournamentController::class, 'submit'])->middleware('throttle:submissions');
        Route::get('/tournaments/{slug}/me', [TournamentController::class, 'me']);
        Route::post('/ghost-events/{slug}/sessions', [GhostEventController::class, 'createSession']);
        Route::post('/ghost-events/{slug}/submissions', [GhostEventController::class, 'submit'])->middleware('throttle:submissions');
        Route::get('/ghost-events/{slug}/me', [GhostEventController::class, 'me']);
        Route::get('/entitlements', [EntitlementController::class, 'index']);
        Route::get('/cosmetics', [CosmeticController::class, 'index']);
        Route::patch('/loadout', [CosmeticController::class, 'updateLoadout']);
        Route::get('/notifications', [NotificationController::class, 'index'])->middleware('throttle:notifications');
        Route::post('/notifications/read-all', [NotificationController::class, 'readAll'])->middleware('throttle:notifications');
        Route::post('/notifications/{notification}/read', [NotificationController::class, 'read'])->middleware('throttle:notifications');
        Route::get('/notification-preferences', [NotificationController::class, 'preferences']);
        Route::patch('/notification-preferences', [NotificationController::class, 'updatePreferences']);

        Route::post('/results/{runId}/share', [ShareController::class, 'share']);
        Route::patch('/results/{runId}/visibility', [ShareController::class, 'updateVisibility']);

        // --------------------------------------------------------------
        // Admin foundation
        // --------------------------------------------------------------
        Route::prefix('admin')->middleware('admin')->group(function () {
            Route::get('/users', [AdminUserController::class, 'index']);
            Route::post('/users/{user}/suspend', [AdminUserController::class, 'suspend']);
            Route::post('/users/{user}/ban', [AdminUserController::class, 'ban']);
            Route::post('/users/{user}/reinstate', [AdminUserController::class, 'reinstate']);

            Route::get('/runs', [AdminRunController::class, 'index']);
            Route::get('/runs/{run}', [AdminRunController::class, 'show']);
            Route::post('/runs/{run}/review', [AdminRunController::class, 'review']);

            Route::get('/challenges', [AdminChallengeController::class, 'index']);
            Route::get('/seasons', [AdminSeasonController::class, 'index']);
            Route::get('/seasons/{season}', [AdminSeasonController::class, 'show']);
            Route::post('/seasons/{season}/transition', [AdminSeasonController::class, 'transition']);
            Route::get('/tournaments', [AdminTournamentController::class, 'index']);
            Route::get('/tournaments/{tournament}', [AdminTournamentController::class, 'show']);
            Route::post('/tournaments/{tournament}/transition', [AdminTournamentController::class, 'transition']);
            Route::get('/ghost-events', [AdminGhostEventController::class, 'index']);
            Route::get('/ghost-events/{ghostEvent}', [AdminGhostEventController::class, 'show']);
            Route::patch('/ghost-events/{ghostEvent}', [AdminGhostEventController::class, 'update']);
            Route::get('/review-queue', [AdminReviewQueueController::class, 'index']);
            Route::post('/review-queue/{item}/review', [AdminReviewQueueController::class, 'review']);
            Route::get('/feature-flags', [AdminFeatureFlagController::class, 'index']);
            Route::patch('/feature-flags/{featureFlag}', [AdminFeatureFlagController::class, 'update']);
            Route::get('/beta-invites', [AdminBetaInviteController::class, 'index']);
            Route::post('/beta-invites', [AdminBetaInviteController::class, 'store'])->middleware('throttle:invites');
            Route::patch('/beta-invites/{betaInvite}', [AdminBetaInviteController::class, 'update']);
            Route::get('/system-health', [AdminSystemHealthController::class, 'index']);
            Route::post('/leaderboards/audit', [AdminLeaderboardIntegrityController::class, 'audit']);
            Route::post('/leaderboards/rebuild', [AdminLeaderboardIntegrityController::class, 'rebuild']);
        });
    });
});
