<?php

namespace Tests\Feature\Seasons;

use App\Domain\Races\Models\RaceRun;
use App\Domain\Rewards\Models\LifecycleRewardGrant;
use App\Domain\Seasons\Models\Season;
use App\Domain\Seasons\Models\SeasonParticipant;
use App\Domain\Seasons\Models\SeasonRatingTransaction;
use App\Domain\Seasons\Services\SeasonLifecycleService;
use App\Domain\Seasons\Services\SeasonParticipationService;
use App\Domain\Seasons\Services\SeasonRatingService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SeasonLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private function makeSeason(array $overrides = []): Season
    {
        $season = Season::create(array_merge([
            'slug' => 'test-season',
            'name' => 'Test Season',
            'description' => 'Test',
            'status' => Season::STATUS_DRAFT,
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addDays(30),
            'registration_starts_at' => now()->subDays(2),
            'registration_ends_at' => now()->addDays(7),
            'rules_version' => 1,
            'catalog_version' => 1,
            'physics_version' => '1.0.0',
            'is_primary' => true,
            'reward_configuration_json' => [
                'rewards' => [
                    ['key' => 'season_badge', 'max_rank' => 100],
                ],
            ],
        ], $overrides));

        app(SeasonLifecycleService::class)->seedDivisions($season);

        return $season->fresh();
    }

    public function test_lifecycle_open_activate_close_finalize_is_idempotent(): void
    {
        $lifecycle = app(SeasonLifecycleService::class);
        $season = $this->makeSeason();

        $lifecycle->openRegistration($season);
        $this->assertSame(Season::STATUS_REGISTRATION, $season->fresh()->status);
        $lifecycle->openRegistration($season->fresh());
        $this->assertSame(Season::STATUS_REGISTRATION, $season->fresh()->status);

        $lifecycle->activate($season->fresh());
        $this->assertSame(Season::STATUS_ACTIVE, $season->fresh()->status);
        $lifecycle->activate($season->fresh());
        $this->assertSame(Season::STATUS_ACTIVE, $season->fresh()->status);

        $lifecycle->close($season->fresh());
        $lifecycle->finalize($season->fresh());
        $this->assertSame(Season::STATUS_COMPLETED, $season->fresh()->status);
        $lifecycle->finalize($season->fresh());
        $this->assertSame(Season::STATUS_COMPLETED, $season->fresh()->status);
    }

    public function test_only_one_primary_active_season(): void
    {
        $lifecycle = app(SeasonLifecycleService::class);
        $a = $this->makeSeason(['slug' => 'season-a']);
        $b = $this->makeSeason(['slug' => 'season-b']);

        $lifecycle->openRegistration($a);
        $lifecycle->activate($a->fresh());

        $lifecycle->openRegistration($b);
        $this->expectException(\App\Support\ApiException::class);
        $lifecycle->activate($b->fresh());
    }

    public function test_join_season_and_banned_user_blocked(): void
    {
        $lifecycle = app(SeasonLifecycleService::class);
        $participation = app(SeasonParticipationService::class);
        $season = $this->makeSeason();
        $lifecycle->openRegistration($season);
        $lifecycle->activate($season->fresh());

        $user = User::factory()->create();
        $participant = $participation->join($user, $season->fresh());
        $this->assertSame($user->id, $participant->user_id);
        $this->assertSame(1000, $participant->current_rating);

        $again = $participation->join($user, $season->fresh());
        $this->assertSame($participant->id, $again->id);

        $banned = User::factory()->create(['competitive_status' => User::STATUS_BANNED]);
        $this->expectException(\App\Support\ApiException::class);
        $participation->join($banned, $season->fresh());
    }

    public function test_finalize_awards_reward_once(): void
    {
        $lifecycle = app(SeasonLifecycleService::class);
        $participation = app(SeasonParticipationService::class);
        $season = $this->makeSeason();
        $lifecycle->openRegistration($season);
        $lifecycle->activate($season->fresh());

        $user = User::factory()->create();
        $participation->join($user, $season->fresh());

        $lifecycle->close($season->fresh());
        $lifecycle->finalize($season->fresh());
        $lifecycle->finalize($season->fresh());

        $this->assertSame(1, LifecycleRewardGrant::where([
            'user_id' => $user->id,
            'reward_key' => 'season_badge',
        ])->count());
        $this->assertSame(SeasonParticipant::REWARD_AWARDED, SeasonParticipant::where('user_id', $user->id)->value('reward_status'));
    }

    public function test_placement_rating_and_duplicate_ignored(): void
    {
        $lifecycle = app(SeasonLifecycleService::class);
        $participation = app(SeasonParticipationService::class);
        $rating = app(SeasonRatingService::class);
        $season = $this->makeSeason();
        $lifecycle->openRegistration($season);
        $lifecycle->activate($season->fresh());

        $user = User::factory()->create();
        $participation->join($user, $season->fresh());

        $run = RaceRun::create([
            'user_id' => $user->id,
            'race_session_id' => null,
            'submission_id' => 'sub-1',
            'course_id' => 'starter-circuit',
            'environment_id' => 'alpine-training-valley',
            'weather_preset_id' => 'calm',
            'course_version' => 1,
            'environment_version' => 1,
            'weather_preset_version' => 1,
            'physics_version' => '1.0.0',
            'client_build_version' => '0.6.0',
            'replay_version' => 2,
            'submission_version' => 1,
            'duration_ms' => 40000,
            'gate_count' => 9,
            'completed' => true,
            'crashed' => false,
            'status' => RaceRun::STATUS_ACCEPTED,
            'session_nonce' => 'n',
            'client_metadata' => ['reference_duration_ms' => 60000],
            'context_type' => 'season',
            'context_id' => $season->id,
            'submitted_at' => now(),
            'verified_at' => now(),
        ]);

        $first = $rating->applyAcceptedRun($user, $run, $season->fresh());
        $this->assertContains('placement_run', $first['explanationCodes']);
        $this->assertGreaterThan(1000, $first['newRating']);

        $second = $rating->applyAcceptedRun($user, $run, $season->fresh());
        $this->assertContains('already_applied', $second['explanationCodes']);
        $this->assertSame(1, SeasonRatingTransaction::where('source_type', 'placement_run')->where('source_id', (string) $run->id)->count());
    }

    public function test_api_current_and_join(): void
    {
        $lifecycle = app(SeasonLifecycleService::class);
        $season = $this->makeSeason(['slug' => 'api-season']);
        $lifecycle->openRegistration($season);
        $lifecycle->activate($season->fresh());

        $this->getJson('/api/v1/seasons/current')->assertOk()->assertJsonPath('season.slug', 'api-season');

        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;
        $this->withToken($token)->postJson('/api/v1/seasons/api-season/join')->assertCreated();
        $this->withToken($token)->getJson('/api/v1/seasons/api-season/me')->assertOk()->assertJsonPath('participant.user_id', $user->id);
    }
}
