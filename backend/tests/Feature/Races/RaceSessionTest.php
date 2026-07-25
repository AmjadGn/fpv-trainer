<?php

namespace Tests\Feature\Races;

use App\Domain\Races\Models\RaceSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RaceSessionTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_pilot_can_create_a_race_session(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAsToken($user)->postJson('/api/v1/race-sessions', [
            'courseId' => 'starter-circuit',
            'weatherPresetId' => 'calm',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('session.courseId', 'starter-circuit');
        $response->assertJsonPath('session.environmentId', 'alpine-training-valley');
        $this->assertNotEmpty($response->json('session.nonce'));

        $this->assertDatabaseHas('race_sessions', [
            'user_id' => $user->id,
            'course_id' => 'starter-circuit',
            'status' => RaceSession::STATUS_ACTIVE,
        ]);
    }

    public function test_session_creation_requires_authentication(): void
    {
        $this->postJson('/api/v1/race-sessions', ['courseId' => 'starter-circuit', 'weatherPresetId' => 'calm'])
            ->assertStatus(401);
    }

    public function test_session_creation_rejects_unknown_course_or_weather(): void
    {
        $user = User::factory()->create();

        $this->actingAsToken($user)->postJson('/api/v1/race-sessions', [
            'courseId' => 'nonexistent-course',
            'weatherPresetId' => 'calm',
        ])->assertStatus(422);

        $this->actingAsToken($user)->postJson('/api/v1/race-sessions', [
            'courseId' => 'starter-circuit',
            'weatherPresetId' => 'nonexistent-weather',
        ])->assertStatus(422);
    }

    public function test_session_creation_rejects_weather_not_valid_for_environment(): void
    {
        $user = User::factory()->create();

        // desert-calm is only valid on desert-industrial-yard, not starter-circuit's alpine env.
        $this->actingAsToken($user)->postJson('/api/v1/race-sessions', [
            'courseId' => 'starter-circuit',
            'weatherPresetId' => 'desert-calm',
        ])->assertStatus(422);
    }

    public function test_restricted_pilot_cannot_create_a_race_session(): void
    {
        $user = User::factory()->suspended()->create();

        $this->actingAsToken($user)->postJson('/api/v1/race-sessions', [
            'courseId' => 'starter-circuit',
            'weatherPresetId' => 'calm',
        ])->assertStatus(403);
    }

    public function test_a_pilot_cannot_access_another_pilots_session(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();

        $session = RaceSession::create([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'user_id' => $owner->id,
            'course_id' => 'starter-circuit',
            'environment_id' => 'alpine-training-valley',
            'weather_preset_id' => 'calm',
            'nonce' => bin2hex(random_bytes(24)),
            'rules_version' => 1,
            'physics_version' => '1.0.0',
            'status' => RaceSession::STATUS_ACTIVE,
            'expires_at' => now()->addMinutes(15),
        ]);

        /** @var \App\Domain\Races\Services\RaceSessionService $service */
        $service = app(\App\Domain\Races\Services\RaceSessionService::class);

        $this->expectException(\App\Support\ApiException::class);
        $service->findOwned($intruder, $session->id);
    }

    public function test_expire_stale_sessions_marks_past_sessions_expired(): void
    {
        $user = User::factory()->create();

        $session = RaceSession::create([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'user_id' => $user->id,
            'course_id' => 'starter-circuit',
            'environment_id' => 'alpine-training-valley',
            'weather_preset_id' => 'calm',
            'nonce' => bin2hex(random_bytes(24)),
            'rules_version' => 1,
            'physics_version' => '1.0.0',
            'status' => RaceSession::STATUS_ACTIVE,
            'expires_at' => now()->subMinutes(1),
        ]);

        $this->artisan('fpv:race-sessions:cleanup')->assertSuccessful();

        $this->assertSame(RaceSession::STATUS_EXPIRED, $session->refresh()->status);
    }

    protected function actingAsToken(User $user): static
    {
        $token = $user->createToken('test')->plainTextToken;

        return $this->withToken($token);
    }
}
