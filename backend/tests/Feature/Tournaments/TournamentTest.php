<?php

namespace Tests\Feature\Tournaments;

use App\Domain\Tournaments\Models\Tournament;
use App\Domain\Tournaments\Models\TournamentAttempt;
use App\Domain\Tournaments\Services\TournamentService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\RaceSubmissionFixtures;
use Tests\TestCase;

class TournamentTest extends TestCase
{
    use RefreshDatabase;

    private function makeTournament(array $overrides = []): Tournament
    {
        return Tournament::create(array_merge([
            'slug' => 'limited-trial',
            'name' => 'Limited Trial',
            'description' => 'Test tournament',
            'status' => Tournament::STATUS_DRAFT,
            'format' => Tournament::FORMAT_LIMITED_ATTEMPTS,
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addDay(),
            'registration_starts_at' => now()->subDay(),
            'registration_ends_at' => now()->addHours(12),
            'max_attempts' => 2,
            'environment_id' => RaceSubmissionFixtures::ENVIRONMENT_ID,
            'course_id' => RaceSubmissionFixtures::COURSE_ID,
            'course_version' => 1,
            'weather_preset_id' => RaceSubmissionFixtures::WEATHER_ID,
            'rules_version' => 1,
            'physics_version' => '1.0.0',
            'scoring_type' => 'fastest_time',
            'visibility' => 'public',
            'featured' => true,
        ], $overrides));
    }

    public function test_registration_practice_does_not_consume_and_limit_enforced(): void
    {
        $service = app(TournamentService::class);
        $tournament = $this->makeTournament();
        $service->openRegistration($tournament);
        $service->activate($tournament->fresh());

        $user = User::factory()->create();
        $token = $user->createToken('t')->plainTextToken;
        $service->register($user, $tournament->fresh());

        $practice = $this->withToken($token)->postJson('/api/v1/tournaments/limited-trial/sessions', ['practice' => true]);
        $practice->assertCreated();

        $practicePayload = RaceSubmissionFixtures::payload(
            $practice->json('session.id'),
            $practice->json('session.nonce'),
            ['client' => ['buildVersion' => '0.6.0', 'physicsVersion' => '1.0.0', 'replayVersion' => 2]],
        );
        $this->withToken($token)->postJson('/api/v1/tournaments/limited-trial/submissions', $practicePayload)->assertCreated();
        $this->assertSame(1, TournamentAttempt::where('is_practice', true)->count());

        for ($i = 0; $i < 2; $i++) {
            $session = $this->withToken($token)->postJson('/api/v1/tournaments/limited-trial/sessions', ['practice' => false]);
            $session->assertCreated();
            $payload = RaceSubmissionFixtures::payload(
                $session->json('session.id'),
                $session->json('session.nonce'),
                [
                    'submissionId' => (string) Str::uuid(),
                    'client' => ['buildVersion' => '0.6.0', 'physicsVersion' => '1.0.0', 'replayVersion' => 2],
                ],
            );
            $this->withToken($token)->postJson('/api/v1/tournaments/limited-trial/submissions', $payload)->assertCreated();
        }

        $this->assertSame(2, TournamentAttempt::where(['user_id' => $user->id, 'is_practice' => false])->count());

        $extra = $this->withToken($token)->postJson('/api/v1/tournaments/limited-trial/sessions', ['practice' => false]);
        // Session may still create; submission must fail if limit reached before consume.
        if ($extra->status() === 201) {
            $payload = RaceSubmissionFixtures::payload(
                $extra->json('session.id'),
                $extra->json('session.nonce'),
                [
                    'submissionId' => (string) Str::uuid(),
                    'client' => ['buildVersion' => '0.6.0', 'physicsVersion' => '1.0.0', 'replayVersion' => 2],
                ],
            );
            $this->withToken($token)->postJson('/api/v1/tournaments/limited-trial/submissions', $payload)->assertStatus(409);
        }

        // Idempotent retry of same submission id.
        $session = $this->withToken($token)->postJson('/api/v1/tournaments/limited-trial/sessions', ['practice' => true]);
        $sid = (string) Str::uuid();
        $payload = RaceSubmissionFixtures::payload(
            $session->json('session.id'),
            $session->json('session.nonce'),
            [
                'submissionId' => $sid,
                'client' => ['buildVersion' => '0.6.0', 'physicsVersion' => '1.0.0', 'replayVersion' => 2],
            ],
        );
        $first = $this->withToken($token)->postJson('/api/v1/tournaments/limited-trial/submissions', $payload);
        $first->assertCreated();
        // Second identical submission id against a new session would fail session consume;
        // idempotency is at attempt table: create attempt then resubmit same id on fresh payload with new session after limit is ok for practice.
        $again = $service->submitAttempt($user, $tournament->fresh(), $payload);
        $this->assertSame($first->json('attempt.id'), $again->id);
    }

    public function test_expired_tournament_rejects_ranked_session(): void
    {
        $service = app(TournamentService::class);
        $tournament = $this->makeTournament([
            'starts_at' => now()->subDays(3),
            'ends_at' => now()->subDay(),
            'status' => Tournament::STATUS_ACTIVE,
        ]);
        $user = User::factory()->create();
        $service->register($user, $tournament);

        $this->expectException(\App\Support\ApiException::class);
        $service->createSession($user, $tournament, false);
    }
}
