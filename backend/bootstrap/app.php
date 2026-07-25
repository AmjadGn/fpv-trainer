<?php

use App\Http\Middleware\AssignRequestId;
use App\Http\Middleware\EnsureAdmin;
use App\Support\ApiError;
use App\Support\ApiException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

require_once __DIR__.'/../app/Console/Commands/CompetitiveOperationsCommands.php';

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withCommands([
        App\Console\Commands\OpenSeasonRegistrationCommand::class,
        App\Console\Commands\ActivateSeasonsCommand::class,
        App\Console\Commands\CloseSeasonsCommand::class,
        App\Console\Commands\FinalizeSeasonsCommand::class,
        App\Console\Commands\ArchiveSeasonsCommand::class,
        App\Console\Commands\SeasonStatusCommand::class,
        App\Console\Commands\TransitionTournamentsCommand::class,
        App\Console\Commands\AuditLeaderboardsCommand::class,
        App\Console\Commands\RebuildLeaderboardsCommand::class,
        App\Console\Commands\RepairLeaderboardEntryCommand::class,
        App\Console\Commands\ReconcileProgressionCommand::class,
        App\Console\Commands\ReconcileRewardsCommand::class,
        App\Console\Commands\RecalculateSeasonCommand::class,
        App\Console\Commands\AuditReplayStorageCommand::class,
        App\Console\Commands\CleanupNotificationsCommand::class,
        App\Console\Commands\WeeklySummaryCommand::class,
        App\Console\Commands\FpvQueueStatusCommand::class,
    ])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(prepend: [
            AssignRequestId::class,
        ]);

        $middleware->alias([
            'admin' => EnsureAdmin::class,
        ]);
    })
    ->withSchedule(function (Schedule $schedule): void {
        $schedule->command('fpv:challenges:generate-daily')
            ->dailyAt('00:01')
            ->withoutOverlapping();

        $schedule->command('fpv:challenges:generate-weekly')
            ->weeklyOn(1, '00:05')
            ->withoutOverlapping();

        $schedule->command('fpv:challenges:close-expired')
            ->hourly()
            ->withoutOverlapping();

        $schedule->command('fpv:race-sessions:cleanup')
            ->everyFiveMinutes()
            ->withoutOverlapping();

        $schedule->command('fpv:replays:cleanup')
            ->dailyAt('03:00')
            ->withoutOverlapping();

        $schedule->command('seasons:open-registration')->dailyAt('00:10')->withoutOverlapping();
        $schedule->command('seasons:activate')->dailyAt('00:15')->withoutOverlapping();
        $schedule->command('seasons:close')->dailyAt('00:20')->withoutOverlapping();
        $schedule->command('seasons:finalize')->dailyAt('00:25')->withoutOverlapping();
        $schedule->command('seasons:archive')->dailyAt('00:30')->withoutOverlapping();
        $schedule->command('tournaments:transition')->everyFiveMinutes()->withoutOverlapping();
        $schedule->command('notifications:cleanup')->dailyAt('03:15')->withoutOverlapping();
        $schedule->command('leaderboards:audit --dry-run=1')->weeklyOn(1, '03:30')->withoutOverlapping();
        $schedule->command('replay-storage:audit --dry-run=1')->weeklyOn(1, '03:45')->withoutOverlapping();
        $schedule->command('fpv:weekly-summary')->weeklyOn(1, '09:00')->withoutOverlapping();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(function (Request $request, Throwable $e) {
            return $request->is('api/*') || $request->expectsJson();
        });

        $exceptions->render(function (ApiException $e, Request $request) {
            return $e->render();
        });

        $exceptions->render(function (ValidationException $e, Request $request) {
            if (!$request->is('api/*')) {
                return null;
            }

            return ApiError::response(
                'validation_failed',
                'The given data was invalid.',
                422,
                $e->errors(),
                $request,
            );
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if (!$request->is('api/*')) {
                return null;
            }

            return ApiError::response('unauthorized', 'Authentication required.', 401, [], $request);
        });

        $exceptions->render(function (AuthorizationException $e, Request $request) {
            if (!$request->is('api/*')) {
                return null;
            }

            return ApiError::response('forbidden', 'You do not have permission to perform this action.', 403, [], $request);
        });

        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            if (!$request->is('api/*')) {
                return null;
            }

            return ApiError::response('not_found', 'The requested resource was not found.', 404, [], $request);
        });

        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if (!$request->is('api/*')) {
                return null;
            }

            return ApiError::response(
                'http_error',
                $e->getMessage() ?: 'An error occurred.',
                $e->getStatusCode(),
                [],
                $request,
            );
        });

        $exceptions->render(function (Throwable $e, Request $request) {
            if (!$request->is('api/*')) {
                return null;
            }

            $debug = app()->hasDebugModeEnabled();

            return ApiError::response(
                'internal_error',
                $debug ? $e->getMessage() : 'An unexpected error occurred.',
                500,
                $debug ? ['exception' => get_class($e), 'file' => $e->getFile(), 'line' => $e->getLine()] : [],
                $request,
            );
        });
    })->create();
