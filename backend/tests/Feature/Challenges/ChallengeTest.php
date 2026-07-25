<?php

namespace Tests\Feature\Challenges;

use App\Domain\Challenges\Models\ChallengeInstance;
use App\Domain\Challenges\Services\ChallengeRotationService;
use App\Domain\Courses\Services\CatalogService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Support\RaceSubmissionFixtures;
use Tests\TestCase;

class ChallengeTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_challenges_endpoint_self_generates_daily_and_weekly(): void
    {
        $response = $this->getJson('/api/v1/challenges/active');

        $response->assertOk();
        $slugs = collect($response->json('challenges'))->pluck('pool')->all();
        $this->assertContains('daily', $slugs);
        $this->assertContains('weekly', $slugs);
    }

    public function test_challenge_rotation_is_deterministic_for_the_same_date(): void
    {
        $service = app(ChallengeRotationService::class);
        $date = Carbon::create(2026, 3, 10);

        $first = $service->generateDaily($date);
        $firstSlug = $first->definition->slug;

        ChallengeInstance::query()->delete();
        \App\Domain\Challenges\Models\ChallengeDefinition::query()->delete();
        $second = $service->generateDaily($date);

        $this->assertSame($firstSlug, $second->definition->slug);
    }

    public function test_generating_the_same_period_twice_is_idempotent(): void
    {
        $service = app(ChallengeRotationService::class);
        $date = Carbon::create(2026, 3, 10);

        $first = $service->generateDaily($date);
        $second = $service->generateDaily($date);

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, ChallengeInstance::where('pool', 'daily')->where('period', '2026-03-10')->count());
    }

    public function test_pilot_can_complete_a_challenge_via_session_and_submission(): void
    {
        $service = app(ChallengeRotationService::class);
        $daily = $service->generateDaily();
        $slug = $daily->definition->slug;

        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $sessionResponse = $this->withToken($token)->postJson("/api/v1/challenges/{$slug}/sessions");
        $sessionResponse->assertCreated();

        $sessionId = $sessionResponse->json('session.id');
        $nonce = $sessionResponse->json('session.nonce');
        $courseId = $daily->definition->course_id;
        $courseCatalog = app(CatalogService::class)->course($courseId);
        $durationMs = $courseCatalog['minPlausibleDurationMs'] + 5000;

        $payload = RaceSubmissionFixtures::payload($sessionId, $nonce, [
            'course' => ['id' => $courseId, 'version' => 1],
            'environment' => ['id' => $daily->definition->environment_id, 'version' => 1],
            'weather' => ['id' => $daily->definition->weather_preset_id, 'version' => 1],
            'run' => [
                'durationMs' => $durationMs,
                'completed' => true,
                'crashed' => false,
                'splits' => RaceSubmissionFixtures::validSplits($courseCatalog['gateCount'], intdiv($durationMs, $courseCatalog['gateCount'] + 1)),
                'replay' => ['metadata' => [], 'frames' => RaceSubmissionFixtures::validFrames()],
            ],
        ]);

        $submitResponse = $this->withToken($token)->postJson("/api/v1/challenges/{$slug}/submissions", $payload);
        $submitResponse->assertCreated();

        $this->assertDatabaseHas('challenge_results', [
            'challenge_instance_id' => $daily->id,
            'user_id' => $user->id,
        ]);

        $leaderboard = $this->getJson("/api/v1/challenges/{$slug}/leaderboard");
        $leaderboard->assertOk();
        $this->assertCount(1, $leaderboard->json('entries'));
    }

    public function test_unknown_challenge_slug_returns_404(): void
    {
        $this->getJson('/api/v1/challenges/does-not-exist')->assertStatus(404);
    }
}
