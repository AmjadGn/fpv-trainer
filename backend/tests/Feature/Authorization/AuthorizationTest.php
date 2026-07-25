<?php

namespace Tests\Feature\Authorization;

use App\Domain\Races\Models\RaceRun;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaceSubmissionFixtures;
use Tests\TestCase;

class AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_race_run_policy_allows_owner_and_admin_but_not_others(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $admin = User::factory()->admin()->create();

        $run = $this->buildRun($owner);

        $this->assertTrue($owner->can('view', $run));
        $this->assertTrue($admin->can('view', $run));
        $this->assertFalse($stranger->can('view', $run));

        $this->assertTrue($owner->can('share', $run));
        $this->assertFalse($stranger->can('share', $run));
    }

    public function test_non_admin_cannot_access_admin_routes(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)->getJson('/api/v1/admin/users')->assertStatus(403);
    }

    public function test_admin_can_list_users_and_suspend_a_pilot(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create();
        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)->getJson('/api/v1/admin/users')->assertOk();

        $suspendResponse = $this->withToken($token)->postJson("/api/v1/admin/users/{$target->id}/suspend", [
            'reason' => 'Suspicious activity under review',
        ]);

        $suspendResponse->assertOk();
        $suspendResponse->assertJsonPath('user.competitiveStatus', 'restricted');

        $this->assertDatabaseHas('moderation_actions', ['target_user_id' => $target->id, 'action' => 'suspend']);
        $this->assertDatabaseHas('admin_audit_logs', ['admin_user_id' => $admin->id, 'action' => 'user.suspend']);
    }

    public function test_admin_can_resolve_a_manual_review_run(): void
    {
        $admin = User::factory()->admin()->create();
        $pilot = User::factory()->create();
        $run = $this->buildRun($pilot, RaceRun::STATUS_MANUAL_REVIEW);
        $token = $admin->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->postJson("/api/v1/admin/runs/{$run->id}/review", [
            'decision' => 'accepted',
            'reason' => 'Manually verified against footage',
        ]);

        $response->assertOk();
        $response->assertJsonPath('run.status', 'accepted');

        $this->assertDatabaseHas('leaderboard_entries', ['race_run_id' => $run->id]);
    }

    private function buildRun(User $user, string $status = RaceRun::STATUS_ACCEPTED): RaceRun
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
