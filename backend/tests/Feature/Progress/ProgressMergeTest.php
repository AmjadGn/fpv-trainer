<?php

namespace Tests\Feature\Progress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProgressMergeTest extends TestCase
{
    use RefreshDatabase;

    public function test_merge_takes_the_max_of_medal_counts_and_unions_achievements(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        \App\Domain\Progression\Models\PlayerProgress::create([
            'user_id' => $user->id,
            'gold_medals' => 3,
            'silver_medals' => 1,
        ]);

        $payload = [
            'progress' => [
                'goldMedals' => 1, // lower than existing 3 — must not decrease
                'silverMedals' => 5, // higher than existing 1 — must increase
                'bronzeMedals' => 2,
                'level' => 4,
                'completedRaces' => 10,
                'bestTimes' => ['starter-circuit' => 45000],
            ],
            'achievementsUnlocked' => ['first-takeoff', 'first-gate'],
        ];

        $response = $this->withToken($token)->postJson('/api/v1/progress/merge', $payload);

        $response->assertOk();
        $response->assertJsonPath('progress.goldMedals', 3);
        $response->assertJsonPath('progress.silverMedals', 5);
        $response->assertJsonPath('progress.bronzeMedals', 2);

        $this->assertDatabaseHas('user_achievements', ['user_id' => $user->id, 'achievement_id' => 'first-takeoff']);
        $this->assertDatabaseHas('user_achievements', ['user_id' => $user->id, 'achievement_id' => 'first-gate']);
    }

    public function test_merge_is_idempotent_when_applied_twice(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $payload = [
            'progress' => ['goldMedals' => 2, 'completedRaces' => 5, 'bestTimes' => ['starter-circuit' => 50000]],
            'achievementsUnlocked' => ['first-takeoff'],
        ];

        $this->withToken($token)->postJson('/api/v1/progress/merge', $payload)->assertOk();
        $response = $this->withToken($token)->postJson('/api/v1/progress/merge', $payload);

        $response->assertOk();
        $response->assertJsonPath('progress.goldMedals', 2);
        $this->assertSame(1, \App\Domain\Achievements\Models\UserAchievement::where('user_id', $user->id)->count());
    }

    public function test_best_times_keep_the_lower_of_client_and_server_value(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        \App\Domain\Progression\Models\PlayerProgress::create([
            'user_id' => $user->id,
            'best_times' => ['starter-circuit' => 40000],
        ]);

        $this->withToken($token)->postJson('/api/v1/progress/sync', [
            'progress' => ['bestTimes' => ['starter-circuit' => 60000, 'coastal-run' => 55000]],
        ])->assertOk();

        $progress = \App\Domain\Progression\Models\PlayerProgress::where('user_id', $user->id)->first();

        $this->assertSame(40000, $progress->best_times['starter-circuit']);
        $this->assertSame(55000, $progress->best_times['coastal-run']);
    }

    public function test_progress_endpoint_requires_authentication(): void
    {
        $this->getJson('/api/v1/progress')->assertStatus(401);
    }
}
