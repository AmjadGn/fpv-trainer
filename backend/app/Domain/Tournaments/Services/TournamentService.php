<?php

namespace App\Domain\Tournaments\Services;

use App\Domain\Races\Models\RaceRun;
use App\Domain\Races\Models\RaceSession;
use App\Domain\Races\Services\RaceSessionService;
use App\Domain\Races\Services\RaceSubmissionService;
use App\Domain\Tournaments\Models\Tournament;
use App\Domain\Tournaments\Models\TournamentAttempt;
use App\Domain\Tournaments\Models\TournamentRegistration;
use App\Models\User;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class TournamentService
{
    public function __construct(
        private readonly RaceSessionService $sessions,
        private readonly RaceSubmissionService $submissions,
    ) {
    }

    public function listActiveFeatured()
    {
        return Tournament::query()
            ->whereIn('status', [Tournament::STATUS_REGISTRATION, Tournament::STATUS_UPCOMING, Tournament::STATUS_ACTIVE])
            ->where('ends_at', '>', now())
            ->where(fn ($q) => $q->where('featured', true)->orWhere('visibility', 'public'))
            ->orderByDesc('featured')
            ->orderBy('starts_at')
            ->get();
    }

    public function findBySlug(string $slug): Tournament
    {
        return Tournament::where('slug', $slug)->firstOr(fn () => throw ApiException::notFound('Tournament not found.'));
    }

    public function register(User $user, Tournament $tournament): TournamentRegistration
    {
        if ($user->isBanned() || $user->isSuspended()) {
            throw ApiException::forbidden('Your account cannot register for tournaments.');
        }

        return DB::transaction(function () use ($user, $tournament) {
            if (! in_array($tournament->status, [Tournament::STATUS_REGISTRATION, Tournament::STATUS_UPCOMING, Tournament::STATUS_ACTIVE], true)
                || ($tournament->registration_ends_at && $tournament->registration_ends_at->isPast())) {
                throw ApiException::conflict('Tournament registration is closed.');
            }

            return TournamentRegistration::firstOrCreate(
                ['tournament_id' => $tournament->id, 'user_id' => $user->id],
                ['registered_at' => now()],
            );
        });
    }

    public function createSession(User $user, Tournament $tournament, bool $practice = false, ?string $ip = null): RaceSession
    {
        if (! $practice && ! TournamentRegistration::where(['tournament_id' => $tournament->id, 'user_id' => $user->id])->exists()) {
            throw ApiException::forbidden('Register before starting a ranked tournament attempt.');
        }

        if (! $practice && ($tournament->status !== Tournament::STATUS_ACTIVE || $tournament->starts_at->isFuture() || $tournament->ends_at->isPast())) {
            throw ApiException::conflict('Tournament is not active.');
        }

        if ($practice && in_array($tournament->status, [Tournament::STATUS_CANCELLED, Tournament::STATUS_ARCHIVED], true)) {
            throw ApiException::conflict('Tournament is not available for practice.');
        }

        return $this->sessions->create($user, [
            'courseId' => $tournament->course_id,
            'weatherPresetId' => $tournament->weather_preset_id,
            'physicsVersion' => $tournament->physics_version,
            'contextType' => 'tournament',
            'contextId' => $tournament->id,
            'mode' => $practice ? 'practice' : 'ranked',
            'contextMetadata' => ['tournament_id' => $tournament->id, 'practice' => $practice],
        ], $ip);
    }

    public function submitAttempt(User $user, Tournament $tournament, array $payload): TournamentAttempt
    {
        return DB::transaction(function () use ($user, $tournament, $payload) {
            $submissionId = (string) $payload['submissionId'];
            $existing = TournamentAttempt::where([
                'tournament_id' => $tournament->id,
                'submission_id' => $submissionId,
            ])->first();

            if ($existing) {
                return $existing;
            }

            $session = $this->sessions->findOwned($user, (string) $payload['sessionId']);

            if ($session->context_type !== 'tournament' || (int) $session->context_id !== (int) $tournament->id) {
                throw ApiException::forbidden('Session is not for this tournament.');
            }

            $practice = $session->mode === 'practice';

            if (! $practice && $tournament->max_attempts !== null) {
                $used = TournamentAttempt::where([
                    'tournament_id' => $tournament->id,
                    'user_id' => $user->id,
                    'is_practice' => false,
                ])->whereIn('status', ['pending', 'accepted', 'suspicious', 'manual_review', 'rejected'])
                    ->when(! $tournament->count_rejected_attempts, fn ($q) => $q->where('status', '!=', 'rejected'))
                    ->count();

                if ($used >= $tournament->max_attempts) {
                    throw ApiException::conflict('Tournament attempt limit reached.');
                }
            }

            if (! $practice && ($tournament->status !== Tournament::STATUS_ACTIVE || $tournament->ends_at->isPast())) {
                throw ApiException::conflict('Tournament has ended.');
            }

            $run = $this->submissions->submit($user, $payload);

            return TournamentAttempt::create([
                'tournament_id' => $tournament->id,
                'user_id' => $user->id,
                'race_run_id' => $run->id,
                'submission_id' => $submissionId,
                'race_session_id' => $session->id,
                'status' => $run->status,
                'is_practice' => $practice,
                'duration_ms' => $run->duration_ms,
                'crash_count' => $run->crashed ? 1 : 0,
            ]);
        });
    }

    public function recordAcceptedAttempt(RaceRun $run): void
    {
        if ($run->context_type !== 'tournament' || ! $run->isAccepted()) {
            return;
        }

        DB::transaction(function () use ($run) {
            $attempt = TournamentAttempt::where('race_run_id', $run->id)->lockForUpdate()->first();
            if (! $attempt || $attempt->is_practice) {
                if ($attempt) {
                    $attempt->update([
                        'status' => 'accepted',
                        'duration_ms' => $run->duration_ms,
                        'crash_count' => $run->crashed ? 1 : 0,
                        'accepted_at' => $run->verified_at ?? now(),
                    ]);
                }

                return;
            }

            $attempt->update([
                'status' => 'accepted',
                'duration_ms' => $run->duration_ms,
                'crash_count' => $run->crashed ? 1 : 0,
                'accepted_at' => $run->verified_at ?? now(),
            ]);
            $this->recomputeRanks($attempt->tournament_id);
        });
    }

    public function me(User $user, Tournament $tournament): array
    {
        $attempts = TournamentAttempt::where([
            'tournament_id' => $tournament->id,
            'user_id' => $user->id,
            'is_practice' => false,
        ])->get();

        $accepted = $attempts->where('status', 'accepted');
        $used = $attempts->when(
            ! $tournament->count_rejected_attempts,
            fn ($c) => $c->where('status', '!=', 'rejected'),
        )->count();

        return [
            'registered' => TournamentRegistration::where(['tournament_id' => $tournament->id, 'user_id' => $user->id])->exists(),
            'attemptsUsed' => $used,
            'attemptsRemaining' => $tournament->max_attempts === null ? null : max(0, $tournament->max_attempts - $used),
            'bestDurationMs' => $accepted->min('duration_ms'),
            'rank' => $accepted->sortBy('rank')->first()?->rank,
        ];
    }

    public function leaderboard(Tournament $tournament, int $perPage = 25, int $page = 1): array
    {
        $query = TournamentAttempt::query()
            ->with('user:id,username,display_name')
            ->where('tournament_id', $tournament->id)
            ->where('status', 'accepted')
            ->where('is_practice', false)
            ->whereNotNull('rank')
            ->orderBy('rank');

        $total = (clone $query)->count();
        $entries = $query->forPage($page, $perPage)->get()->map(fn (TournamentAttempt $a) => [
            'rank' => $a->rank,
            'username' => $a->user?->username,
            'displayName' => $a->user?->display_name,
            'durationMs' => $a->duration_ms,
            'crashCount' => $a->crash_count,
        ]);

        return [
            'entries' => $entries,
            'page' => $page,
            'perPage' => $perPage,
            'total' => $total,
        ];
    }

    private function recomputeRanks(int $tournamentId): void
    {
        TournamentAttempt::where('tournament_id', $tournamentId)
            ->where('status', 'accepted')
            ->where('is_practice', false)
            ->orderBy('duration_ms')
            ->orderBy('crash_count')
            ->orderBy('accepted_at')
            ->orderBy('id')
            ->get()
            ->each(fn (TournamentAttempt $attempt, int $index) => $attempt->update(['rank' => $index + 1]));
    }

    public function transition(Tournament $tournament, string $status): Tournament
    {
        $allowed = [
            Tournament::STATUS_REGISTRATION => [Tournament::STATUS_DRAFT],
            Tournament::STATUS_UPCOMING => [Tournament::STATUS_DRAFT, Tournament::STATUS_REGISTRATION],
            Tournament::STATUS_ACTIVE => [Tournament::STATUS_REGISTRATION, Tournament::STATUS_UPCOMING],
            Tournament::STATUS_CALCULATING => [Tournament::STATUS_ACTIVE],
            Tournament::STATUS_COMPLETED => [Tournament::STATUS_CALCULATING],
            Tournament::STATUS_CANCELLED => [
                Tournament::STATUS_DRAFT,
                Tournament::STATUS_REGISTRATION,
                Tournament::STATUS_UPCOMING,
                Tournament::STATUS_ACTIVE,
                Tournament::STATUS_CALCULATING,
            ],
            Tournament::STATUS_ARCHIVED => [Tournament::STATUS_COMPLETED, Tournament::STATUS_CANCELLED],
        ];

        return DB::transaction(function () use ($tournament, $status, $allowed) {
            $locked = Tournament::whereKey($tournament->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === $status) {
                return $locked;
            }
            if (! in_array($locked->status, $allowed[$status] ?? [], true)) {
                throw ApiException::conflict('Invalid tournament lifecycle transition.', [
                    'status' => $locked->status,
                    'target' => $status,
                ]);
            }
            $locked->update(['status' => $status]);
            Log::info('Tournament lifecycle transitioned.', [
                'tournament_id' => $locked->id,
                'status' => $status,
            ]);

            return $locked->fresh();
        });
    }

    public function openRegistration(Tournament $tournament): Tournament
    {
        return $this->transition($tournament, Tournament::STATUS_REGISTRATION);
    }

    public function activate(Tournament $tournament): Tournament
    {
        return $this->transition($tournament, Tournament::STATUS_ACTIVE);
    }

    public function close(Tournament $tournament): Tournament
    {
        return $this->transition($tournament, Tournament::STATUS_CALCULATING);
    }

    public function complete(Tournament $tournament): Tournament
    {
        return $this->transition($tournament, Tournament::STATUS_COMPLETED);
    }

    public function cancel(Tournament $tournament): Tournament
    {
        return $this->transition($tournament, Tournament::STATUS_CANCELLED);
    }

    public function archive(Tournament $tournament): Tournament
    {
        return $this->transition($tournament, Tournament::STATUS_ARCHIVED);
    }
}
