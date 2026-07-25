<?php

namespace Tests\Feature\Leaderboards;

use App\Domain\Leaderboards\Services\LeaderboardService;
use App\Domain\Races\Models\RaceRun;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaceSubmissionFixtures;
use Tests\TestCase;

class LeaderboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_fastest_accepted_run_wins_the_top_spot(): void
    {
        $service = app(LeaderboardService::class);

        $slow = $this->makeAcceptedRun(60000);
        $fast = $this->makeAcceptedRun(30000);

        $service->recordAcceptedRun($slow);
        $service->recordAcceptedRun($fast);

        $page = $service->forCourse(RaceSubmissionFixtures::COURSE_ID);
        $this->assertCount(2, $page->items());
        $this->assertSame($fast->user_id, $page->items()[0]->user_id);
        $this->assertSame($slow->user_id, $page->items()[1]->user_id);
    }

    public function test_a_slower_run_never_replaces_a_pilots_existing_faster_time(): void
    {
        $service = app(LeaderboardService::class);
        $user = User::factory()->create();

        $fastRun = $this->makeAcceptedRun(30000, $user);
        $service->recordAcceptedRun($fastRun);

        $slowerRun = $this->makeAcceptedRun(50000, $user);
        $service->recordAcceptedRun($slowerRun);

        $this->assertDatabaseHas('leaderboard_entries', [
            'user_id' => $user->id,
            'course_id' => RaceSubmissionFixtures::COURSE_ID,
            'best_duration_ms' => 30000,
        ]);
        $this->assertDatabaseMissing('leaderboard_entries', ['best_duration_ms' => 50000]);
    }

    public function test_a_faster_run_replaces_the_pilots_existing_time(): void
    {
        $service = app(LeaderboardService::class);
        $user = User::factory()->create();

        $service->recordAcceptedRun($this->makeAcceptedRun(50000, $user));
        $service->recordAcceptedRun($this->makeAcceptedRun(20000, $user));

        $this->assertDatabaseHas('leaderboard_entries', [
            'user_id' => $user->id,
            'best_duration_ms' => 20000,
        ]);
        $this->assertSame(1, \App\Domain\Leaderboards\Models\LeaderboardEntry::where('user_id', $user->id)->count());
    }

    public function test_rejected_runs_never_reach_the_leaderboard(): void
    {
        $service = app(LeaderboardService::class);

        $rejected = $this->makeRun(20000, null, RaceRun::STATUS_REJECTED);
        $service->recordAcceptedRun($rejected);

        $this->assertDatabaseMissing('leaderboard_entries', ['race_run_id' => $rejected->id]);
    }

    public function test_leaderboard_is_paginated(): void
    {
        $service = app(LeaderboardService::class);

        foreach (range(1, 5) as $i) {
            $service->recordAcceptedRun($this->makeAcceptedRun(30000 + $i * 1000));
        }

        $page = $service->forCourse(RaceSubmissionFixtures::COURSE_ID, perPage: 2, page: 1);

        $this->assertCount(2, $page->items());
        $this->assertSame(5, $page->total());
        $this->assertSame(3, $page->lastPage());
    }

    public function test_around_me_returns_a_window_centered_on_the_pilot(): void
    {
        $service = app(LeaderboardService::class);
        $me = User::factory()->create();

        foreach (range(1, 10) as $i) {
            $service->recordAcceptedRun($this->makeAcceptedRun(20000 + $i * 1000));
        }

        $myRun = $this->makeAcceptedRun(25500, $me);
        $service->recordAcceptedRun($myRun);

        $window = $service->aroundUser(RaceSubmissionFixtures::COURSE_ID, $me, windowSize: 2);

        $this->assertTrue($window->contains(fn ($entry) => (int) $entry->user_id === $me->id));
        $this->assertLessThanOrEqual(5, $window->count());
    }

    private function makeAcceptedRun(int $durationMs, ?User $user = null): RaceRun
    {
        return $this->makeRun($durationMs, $user, RaceRun::STATUS_ACCEPTED);
    }

    private function makeRun(int $durationMs, ?User $user, string $status): RaceRun
    {
        $user ??= User::factory()->create();

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
            'duration_ms' => $durationMs,
            'gate_count' => 9,
            'completed' => true,
            'crashed' => false,
            'status' => $status,
            'submitted_at' => now(),
            'verified_at' => now(),
        ]);
    }
}
