<?php

namespace Tests\Feature\Races;

use App\Domain\Races\Models\RaceRun;
use App\Domain\Races\Models\RaceSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaceSubmissionFixtures;
use Tests\TestCase;

class RaceSubmissionTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_valid_submission_is_accepted_and_appears_on_the_leaderboard(): void
    {
        $user = User::factory()->create();
        [$sessionId, $nonce] = $this->createSession($user);

        $payload = RaceSubmissionFixtures::payload($sessionId, $nonce);

        $response = $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $payload);

        $response->assertCreated();
        $response->assertJsonPath('run.status', 'accepted');
        $response->assertJsonPath('run.verified', true);

        $this->assertDatabaseHas('leaderboard_entries', [
            'user_id' => $user->id,
            'course_id' => RaceSubmissionFixtures::COURSE_ID,
            'best_duration_ms' => 42000,
        ]);

        $this->assertDatabaseHas('race_sessions', ['id' => $sessionId, 'status' => RaceSession::STATUS_CONSUMED]);
    }

    public function test_resubmitting_the_same_submission_id_is_idempotent(): void
    {
        $user = User::factory()->create();
        [$sessionId, $nonce] = $this->createSession($user);
        $payload = RaceSubmissionFixtures::payload($sessionId, $nonce);

        $first = $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $payload);
        $first->assertCreated();

        $second = $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $payload);
        $second->assertCreated();

        $this->assertSame($first->json('run.id'), $second->json('run.id'));
        $this->assertSame(1, RaceRun::where('submission_id', $payload['submissionId'])->count());
    }

    public function test_a_different_submission_id_against_an_already_consumed_session_conflicts(): void
    {
        $user = User::factory()->create();
        [$sessionId, $nonce] = $this->createSession($user);

        $first = RaceSubmissionFixtures::payload($sessionId, $nonce);
        $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $first)->assertCreated();

        $second = RaceSubmissionFixtures::payload($sessionId, $nonce);
        $response = $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $second);

        $response->assertStatus(409);
        $response->assertJsonPath('error.code', 'conflict');
    }

    public function test_submission_rejects_duration_faster_than_min_plausible(): void
    {
        $user = User::factory()->create();
        [$sessionId, $nonce] = $this->createSession($user);

        $payload = RaceSubmissionFixtures::payload($sessionId, $nonce, [
            'run' => [
                'durationMs' => 500, // starter-circuit minPlausibleDurationMs is 15000
                'completed' => true,
                'crashed' => false,
                'splits' => RaceSubmissionFixtures::validSplits(),
                'replay' => ['metadata' => [], 'frames' => RaceSubmissionFixtures::validFrames()],
            ],
        ]);

        $response = $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $payload);

        $response->assertCreated();
        $response->assertJsonPath('run.status', 'rejected');
        $response->assertJsonPath('run.verified', false);
    }

    public function test_submission_rejects_non_monotonic_splits(): void
    {
        $user = User::factory()->create();
        [$sessionId, $nonce] = $this->createSession($user);

        $payload = RaceSubmissionFixtures::payload($sessionId, $nonce, [
            'run' => [
                'durationMs' => 42000,
                'completed' => true,
                'crashed' => false,
                'splits' => [
                    ['gateIndex' => 0, 'timeMs' => 5000],
                    ['gateIndex' => 1, 'timeMs' => 3000], // goes backwards in time
                ],
                'replay' => ['metadata' => [], 'frames' => RaceSubmissionFixtures::validFrames()],
            ],
        ]);

        $response = $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $payload);

        $response->assertCreated();
        $response->assertJsonPath('run.status', 'rejected');
    }

    public function test_submission_flags_gate_count_mismatch_as_suspicious_not_hard_rejected(): void
    {
        $user = User::factory()->create();
        [$sessionId, $nonce] = $this->createSession($user);

        $payload = RaceSubmissionFixtures::payload($sessionId, $nonce, [
            'run' => [
                'durationMs' => 42000,
                'completed' => true,
                'crashed' => false,
                'splits' => array_slice(RaceSubmissionFixtures::validSplits(), 0, 5), // only 5 of 9 gates
                'replay' => ['metadata' => [], 'frames' => RaceSubmissionFixtures::validFrames()],
            ],
        ]);

        $response = $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $payload);

        $response->assertCreated();
        $this->assertNotSame('accepted', $response->json('run.status'));
        $this->assertGreaterThan(0, $response->json('run.suspicionScore'));
    }

    public function test_submission_rejects_expired_session(): void
    {
        $user = User::factory()->create();
        [$sessionId, $nonce] = $this->createSession($user, expiresInMinutes: -1);

        $payload = RaceSubmissionFixtures::payload($sessionId, $nonce);

        $response = $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $payload);

        $response->assertStatus(422);
        $response->assertJsonPath('error.code', 'session_expired');
    }

    public function test_submission_rejects_unsupported_physics_version(): void
    {
        $user = User::factory()->create();
        [$sessionId, $nonce] = $this->createSession($user);

        $payload = RaceSubmissionFixtures::payload($sessionId, $nonce, [
            'client' => ['buildVersion' => '0.5.0', 'physicsVersion' => '9.9.9', 'replayVersion' => 2],
        ]);

        $response = $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $payload);

        $response->assertCreated();
        $response->assertJsonPath('run.status', 'rejected');
    }

    public function test_submission_rejects_wrong_session_nonce(): void
    {
        $user = User::factory()->create();
        [$sessionId] = $this->createSession($user);

        $payload = RaceSubmissionFixtures::payload($sessionId, 'totally-wrong-nonce');

        $response = $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $payload);

        $response->assertCreated();
        $response->assertJsonPath('run.status', 'rejected');
    }

    public function test_submission_rejects_replay_with_teleport(): void
    {
        $user = User::factory()->create();
        [$sessionId, $nonce] = $this->createSession($user);

        $frames = RaceSubmissionFixtures::validFrames(5);
        $frames[3]['position'] = ['x' => 500.0, 'y' => 1.5, 'z' => 0.0]; // huge unrealistic jump

        $payload = RaceSubmissionFixtures::payload($sessionId, $nonce, [
            'run' => [
                'durationMs' => 42000,
                'completed' => true,
                'crashed' => false,
                'splits' => RaceSubmissionFixtures::validSplits(),
                'replay' => ['metadata' => [], 'frames' => $frames],
            ],
        ]);

        $response = $this->actingAsToken($user)->postJson('/api/v1/race-submissions', $payload);

        $response->assertCreated();
        $this->assertNotSame('accepted', $response->json('run.status'));
        $this->assertGreaterThanOrEqual(30, $response->json('run.suspicionScore'));
    }

    public function test_submission_requires_authentication(): void
    {
        $this->postJson('/api/v1/race-submissions', ['submissionVersion' => 1])->assertStatus(401);
    }

    /**
     * @return array{0: string, 1: string} [sessionId, nonce]
     */
    private function createSession(User $user, int $expiresInMinutes = 15): array
    {
        $session = RaceSession::create([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'user_id' => $user->id,
            'course_id' => RaceSubmissionFixtures::COURSE_ID,
            'environment_id' => RaceSubmissionFixtures::ENVIRONMENT_ID,
            'weather_preset_id' => RaceSubmissionFixtures::WEATHER_ID,
            'nonce' => bin2hex(random_bytes(24)),
            'rules_version' => 1,
            'physics_version' => '1.0.0',
            'status' => RaceSession::STATUS_ACTIVE,
            'expires_at' => now()->addMinutes($expiresInMinutes),
        ]);

        return [$session->id, $session->nonce];
    }

    protected function actingAsToken(User $user): static
    {
        $token = $user->createToken('test')->plainTextToken;

        return $this->withToken($token);
    }
}
