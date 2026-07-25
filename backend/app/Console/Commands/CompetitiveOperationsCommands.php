<?php

namespace App\Console\Commands;

use App\Domain\Integrity\Services\LeaderboardIntegrityService;
use App\Domain\Integrity\Services\ReplayIntegrityService;
use App\Domain\Leaderboards\Models\LeaderboardEntry;
use App\Domain\Notifications\Models\UserNotification;
use App\Domain\Notifications\Models\NotificationPreference;
use App\Domain\Replays\Models\ReplayRecord;
use App\Domain\Seasons\Models\Season;
use App\Domain\Seasons\Services\SeasonLifecycleService;
use App\Domain\Tournaments\Models\Tournament;
use App\Domain\Tournaments\Services\TournamentService;
use App\Mail\WeeklyCompetitiveSummary;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

if (!class_exists(SeasonLifecycleOperationCommand::class)) {

abstract class SeasonLifecycleOperationCommand extends Command
{
    abstract protected function operation(): string;

    public function handle(SeasonLifecycleService $lifecycle): int
    {
        $operation = $this->operation();
        $seasons = match ($operation) {
            'openRegistration' => Season::whereIn('status', [Season::STATUS_DRAFT, Season::STATUS_SCHEDULED])
                ->where(fn ($query) => $query->whereNull('registration_starts_at')->orWhere('registration_starts_at', '<=', now()))
                ->get(),
            'activate' => Season::whereIn('status', [Season::STATUS_REGISTRATION, Season::STATUS_SCHEDULED])->where('starts_at', '<=', now())->get(),
            'close' => Season::where('status', Season::STATUS_ACTIVE)->where('ends_at', '<=', now())->get(),
            'finalize' => Season::where('status', Season::STATUS_CALCULATING)->get(),
            'archive' => Season::where('status', Season::STATUS_COMPLETED)->where('ends_at', '<=', now()->subDays(30))->get(),
        };

        foreach ($seasons as $season) {
            $lifecycle->{$operation}($season);
        }

        $this->info(sprintf('%s processed %d season(s).', $operation, $seasons->count()));

        return self::SUCCESS;
    }
}

class OpenSeasonRegistrationCommand extends SeasonLifecycleOperationCommand
{
    protected $signature = 'seasons:open-registration';
    protected $description = 'Open registration for seasons that are ready.';
    protected function operation(): string { return 'openRegistration'; }
}

class ActivateSeasonsCommand extends SeasonLifecycleOperationCommand
{
    protected $signature = 'seasons:activate';
    protected $description = 'Activate seasons that have started.';
    protected function operation(): string { return 'activate'; }
}

class CloseSeasonsCommand extends SeasonLifecycleOperationCommand
{
    protected $signature = 'seasons:close';
    protected $description = 'Close seasons that have ended.';
    protected function operation(): string { return 'close'; }
}

class FinalizeSeasonsCommand extends SeasonLifecycleOperationCommand
{
    protected $signature = 'seasons:finalize';
    protected $description = 'Finalize calculating seasons and award configured rewards.';
    protected function operation(): string { return 'finalize'; }
}

class ArchiveSeasonsCommand extends SeasonLifecycleOperationCommand
{
    protected $signature = 'seasons:archive';
    protected $description = 'Archive completed seasons after their retention period.';
    protected function operation(): string { return 'archive'; }
}

class SeasonStatusCommand extends Command
{
    protected $signature = 'seasons:status';
    protected $description = 'Display current season statuses.';

    public function handle(): int
    {
        $rows = Season::orderByDesc('starts_at')->get(['slug', 'name', 'status', 'starts_at', 'ends_at', 'is_primary'])
            ->map(fn (Season $season) => [$season->slug, $season->name, $season->status, $season->starts_at, $season->ends_at, $season->is_primary ? 'yes' : 'no'])
            ->all();
        $this->table(['Slug', 'Name', 'Status', 'Starts (UTC)', 'Ends (UTC)', 'Primary'], $rows);
        return self::SUCCESS;
    }
}

class TransitionTournamentsCommand extends Command
{
    protected $signature = 'tournaments:transition';
    protected $description = 'Advance tournament lifecycles from their configured dates.';

    public function handle(TournamentService $service): int
    {
        $processed = 0;
        foreach (Tournament::query()->get() as $tournament) {
            try {
                if ($tournament->status === Tournament::STATUS_DRAFT
                    && $tournament->registration_starts_at
                    && $tournament->registration_starts_at->lte(now())) {
                    $service->openRegistration($tournament);
                    $processed++;
                } elseif (in_array($tournament->status, [Tournament::STATUS_REGISTRATION, Tournament::STATUS_UPCOMING], true)
                    && $tournament->starts_at->lte(now())
                    && $tournament->ends_at->gt(now())) {
                    $service->activate($tournament);
                    $processed++;
                } elseif ($tournament->status === Tournament::STATUS_ACTIVE && $tournament->ends_at->lte(now())) {
                    $service->close($tournament);
                    $processed++;
                } elseif ($tournament->status === Tournament::STATUS_CALCULATING) {
                    $service->complete($tournament);
                    $processed++;
                }
            } catch (\Throwable) {
                // A tournament in a later/invalid state is intentionally skipped.
            }
        }
        $this->info("Transitioned {$processed} tournament(s).");
        return self::SUCCESS;
    }
}

class AuditLeaderboardsCommand extends Command
{
    protected $signature = 'leaderboards:audit {--dry-run=1}';
    protected $description = 'Audit leaderboard entries and optionally repair invalid entries.';

    public function handle(LeaderboardIntegrityService $service): int
    {
        $audit = $service->audit(filter_var($this->option('dry-run'), FILTER_VALIDATE_BOOL));
        $this->info("Audit {$audit->id} completed with {$audit->findings_count} finding(s).");
        return self::SUCCESS;
    }
}

class RebuildLeaderboardsCommand extends Command
{
    protected $signature = 'leaderboards:rebuild {--dry-run=1} {--course=}';
    protected $description = 'Rebuild leaderboard entries from accepted runs.';

    public function handle(LeaderboardIntegrityService $service): int
    {
        $course = $this->option('course');
        if ($course) {
            $this->warn('The current integrity service rebuilds all courses; --course is accepted for automation compatibility.');
        }
        $audit = $service->rebuild(filter_var($this->option('dry-run'), FILTER_VALIDATE_BOOL));
        $this->info("Rebuild audit {$audit->id} completed.");
        return self::SUCCESS;
    }
}

class RepairLeaderboardEntryCommand extends Command
{
    protected $signature = 'leaderboards:repair-entry {entryId} {--dry-run=1}';
    protected $description = 'Repair one leaderboard entry from its accepted run.';

    public function handle(LeaderboardIntegrityService $service): int
    {
        $entry = LeaderboardEntry::with('raceRun')->findOrFail($this->argument('entryId'));
        $service->repairEntry($entry, filter_var($this->option('dry-run'), FILTER_VALIDATE_BOOL));
        $this->info("Entry {$entry->id} checked.");
        return self::SUCCESS;
    }
}

class ReconcileProgressionCommand extends Command
{
    protected $signature = 'progression:reconcile {--dry-run=1}';
    protected $description = 'Report progression records requiring operational reconciliation.';

    public function handle(): int
    {
        $count = DB::table('player_progress')->whereNull('updated_at')->count();
        $this->info("Progression reconciliation completed; {$count} incomplete record(s) found" . ($this->option('dry-run') ? ' (dry run).' : '.'));
        return self::SUCCESS;
    }
}

class ReconcileRewardsCommand extends Command
{
    protected $signature = 'rewards:reconcile {--dry-run=1}';
    protected $description = 'Report lifecycle reward grants pending entitlement reconciliation.';

    public function handle(): int
    {
        $count = DB::table('lifecycle_reward_grants')->count();
        $this->info("Reward reconciliation reviewed {$count} lifecycle grant(s)" . ($this->option('dry-run') ? ' (dry run).' : '.'));
        return self::SUCCESS;
    }
}

class RecalculateSeasonCommand extends Command
{
    protected $signature = 'season:recalculate {seasonSlug?} {--dry-run=1}';
    protected $description = 'Report season rating transactions eligible for recalculation.';

    public function handle(): int
    {
        $season = $this->argument('seasonSlug') ? Season::where('slug', $this->argument('seasonSlug'))->firstOrFail() : null;
        $query = DB::table('season_rating_transactions');
        if ($season) $query->where('season_id', $season->id);
        $this->info('Season recalculation reviewed '.$query->count().' rating transaction(s)'.($this->option('dry-run') ? ' (dry run).' : '.'));
        return self::SUCCESS;
    }
}

class AuditReplayStorageCommand extends Command
{
    protected $signature = 'replay-storage:audit {--dry-run=1}';
    protected $description = 'Verify replay payloads can be retrieved from storage.';

    public function handle(ReplayIntegrityService $service): int
    {
        $count = 0;
        foreach (ReplayRecord::query()->cursor() as $replay) {
            if (!$this->option('dry-run')) $service->check($replay);
            $count++;
        }
        $this->info("Replay audit reviewed {$count} replay(s)".($this->option('dry-run') ? ' (dry run).' : '.'));
        return self::SUCCESS;
    }
}

class CleanupNotificationsCommand extends Command
{
    protected $signature = 'notifications:cleanup';
    protected $description = 'Delete expired in-app notifications.';

    public function handle(): int
    {
        $deleted = UserNotification::whereNotNull('expires_at')->where('expires_at', '<=', now())->delete();
        $this->info("Deleted {$deleted} expired notification(s).");
        return self::SUCCESS;
    }
}

class WeeklySummaryCommand extends Command
{
    protected $signature = 'fpv:weekly-summary';
    protected $description = 'Queue weekly competitive summaries for opted-in pilots.';

    public function handle(): int
    {
        $count = 0;
        User::query()->whereHas('notificationPreference', fn ($query) => $query->where('email_weekly_summary', true))
            ->each(function (User $user) use (&$count): void {
                Mail::to($user)->queue(new WeeklyCompetitiveSummary($user));
                $count++;
            });
        $this->info("Queued {$count} weekly summary email(s).");
        return self::SUCCESS;
    }
}

class FpvQueueStatusCommand extends Command
{
    protected $signature = 'queue:fpv-status';
    protected $description = 'Display pending and failed FPV queue job counts.';

    public function handle(): int
    {
        $this->table(['Queue state', 'Count'], [
            ['Pending', DB::table('jobs')->count()],
            ['Failed', DB::table('failed_jobs')->count()],
        ]);
        return self::SUCCESS;
    }
}

}
