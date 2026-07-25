<?php

namespace App\Providers;

use App\Domain\AntiCheat\Services\RunVerificationService;
use App\Domain\Courses\Services\CatalogService;
use App\Domain\Races\Models\RaceRun;
use App\Domain\Races\Policies\RaceRunPolicy;
use App\Domain\Races\Services\RaceSessionService;
use App\Domain\Replays\Services\ReplayStorageService;
use App\Domain\Races\Events\RankedRunAccepted;
use App\Domain\Challenges\Listeners\RecordChallengeResultOnAccepted;
use App\Listeners\CompetitiveRunAcceptedListener;
use Illuminate\Support\Facades\Event;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(CatalogService::class, function () {
            return new CatalogService(config('fpv.catalog_path'));
        });

        $this->app->singleton(RunVerificationService::class, function () {
            return new RunVerificationService(
                app(CatalogService::class),
                (float) config('fpv.anticheat.max_speed_mps'),
                (float) config('fpv.anticheat.max_teleport_distance_m'),
                (float) config('fpv.anticheat.max_altitude_m'),
                (float) config('fpv.anticheat.min_altitude_m'),
                (int) config('fpv.anticheat.suspicion_manual_review_threshold'),
                (int) config('fpv.anticheat.suspicion_reject_threshold'),
            );
        });

        $this->app->singleton(ReplayStorageService::class, function () {
            return new ReplayStorageService(
                (int) config('fpv.max_replay_bytes'),
                (int) config('fpv.max_replay_frames'),
            );
        });

        $this->app->singleton(RaceSessionService::class, function () {
            return new RaceSessionService(
                app(CatalogService::class),
                (int) config('fpv.race_session_ttl_minutes'),
            );
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::policy(RaceRun::class, RaceRunPolicy::class);
        Event::listen(RankedRunAccepted::class, RecordChallengeResultOnAccepted::class);
        Event::listen(RankedRunAccepted::class, CompetitiveRunAcceptedListener::class);

        RateLimiter::for('auth', function (Request $request) {
            return Limit::perMinute((int) config('fpv.rate_limits.auth'))->by($request->ip());
        });

        RateLimiter::for('submissions', function (Request $request) {
            $identifier = $request->user()?->id ?: $request->ip();

            return Limit::perMinute((int) config('fpv.rate_limits.submissions'))->by($identifier);
        });

        RateLimiter::for('invites', function (Request $request) {
            return Limit::perMinute((int) config('fpv.rate_limits.invites'))->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('notifications', function (Request $request) {
            return Limit::perMinute((int) config('fpv.rate_limits.notifications'))->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('api', function (Request $request) {
            $identifier = $request->user()?->id ?: $request->ip();

            return Limit::perMinute((int) config('fpv.rate_limits.default_api'))->by($identifier);
        });
    }
}
