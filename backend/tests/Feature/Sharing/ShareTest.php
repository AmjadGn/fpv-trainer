<?php

namespace Tests\Feature\Sharing;

use App\Domain\Races\Models\RaceRun;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaceSubmissionFixtures;
use Tests\TestCase;

class ShareTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_share_an_accepted_run_and_it_becomes_publicly_visible(): void
    {
        $user = User::factory()->create();
        $run = $this->acceptedRun($user);
        $token = $user->createToken('test')->plainTextToken;

        $shareResponse = $this->withToken($token)->postJson("/api/v1/results/{$run->id}/share", ['visibility' => 'unlisted']);
        $shareResponse->assertCreated();

        $publicId = $shareResponse->json('share.publicId');

        $publicResponse = $this->getJson("/api/v1/public/results/{$publicId}");
        $publicResponse->assertOk();
        $publicResponse->assertJsonPath('run.courseId', RaceSubmissionFixtures::COURSE_ID);
    }

    public function test_private_shares_are_not_publicly_visible(): void
    {
        $user = User::factory()->create();
        $run = $this->acceptedRun($user);
        $token = $user->createToken('test')->plainTextToken;

        $shareResponse = $this->withToken($token)->postJson("/api/v1/results/{$run->id}/share", ['visibility' => 'private']);
        $publicId = $shareResponse->json('share.publicId');

        $this->getJson("/api/v1/public/results/{$publicId}")->assertStatus(404);
    }

    public function test_owner_can_update_visibility(): void
    {
        $user = User::factory()->create();
        $run = $this->acceptedRun($user);
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)->postJson("/api/v1/results/{$run->id}/share", ['visibility' => 'private'])->assertCreated();
        $shareResponse = $this->withToken($token)->patchJson("/api/v1/results/{$run->id}/visibility", ['visibility' => 'public']);

        $shareResponse->assertOk();
        $shareResponse->assertJsonPath('share.visibility', 'public');
    }

    public function test_a_non_owner_cannot_share_someone_elses_run(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $run = $this->acceptedRun($owner);
        $token = $intruder->createToken('test')->plainTextToken;

        $this->withToken($token)->postJson("/api/v1/results/{$run->id}/share")->assertStatus(404);
    }

    public function test_pending_or_rejected_runs_cannot_be_shared(): void
    {
        $user = User::factory()->create();
        $run = $this->acceptedRun($user, status: RaceRun::STATUS_REJECTED);
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)->postJson("/api/v1/results/{$run->id}/share")->assertStatus(422);
    }

    private function acceptedRun(User $user, string $status = RaceRun::STATUS_ACCEPTED): RaceRun
    {
        return RaceRun::create([
            'user_id' => $user->id,
            'submission_id' => (string) \Illuminate\Support\Str::uuid(),
            'course_id' => RaceSubmissionFixtures::COURSE_ID,
            'environment_id' => RaceSubmissionFixtures::ENVIRONMENT_ID,
            'weather_preset_id' => RaceSubmissionFixtures::WEATHER_ID,
            'course_version' => 1,
            'environment_version' => 1,
            'weather_preset_version' => 1,
            'physics_version' => '1.0.0',
            'replay_version' => 2,
            'submission_version' => 1,
            'duration_ms' => 42000,
            'gate_count' => 9,
            'completed' => true,
            'crashed' => false,
            'status' => $status,
            'submitted_at' => now(),
            'verified_at' => now(),
        ]);
    }
}
