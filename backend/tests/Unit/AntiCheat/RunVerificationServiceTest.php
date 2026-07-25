<?php

namespace Tests\Unit\AntiCheat;

use App\Domain\AntiCheat\Services\RunVerificationService;
use App\Domain\Courses\Services\CatalogService;
use App\Domain\Races\Models\RaceRun;
use App\Domain\Races\Models\RaceSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaceSubmissionFixtures;
use Tests\TestCase;

class RunVerificationServiceTest extends TestCase
{
    use RefreshDatabase;

    private RunVerificationService $verifier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->verifier = new RunVerificationService(
            app(CatalogService::class),
            maxSpeedMps: 60.0,
            maxTeleportDistanceM: 25.0,
            maxAltitudeM: 500.0,
            minAltitudeM: -50.0,
            manualReviewThreshold: 40,
            rejectThreshold: 80,
        );
    }

    public function test_accepts_a_clean_run(): void
    {
        [$session, $run] = $this->buildSessionAndRun();
        $this->attachSplits($run, RaceSubmissionFixtures::validSplits());

        $result = $this->verifier->verify($session, $run, ['frames' => RaceSubmissionFixtures::validFrames()]);

        $this->assertSame(RaceRun::STATUS_ACCEPTED, $result->status);
        $this->assertSame(0, $result->suspicionScore);
    }

    public function test_flags_speed_beyond_max(): void
    {
        [$session, $run] = $this->buildSessionAndRun();
        $this->attachSplits($run, RaceSubmissionFixtures::validSplits());

        $frames = [
            ['timestampMs' => 0, 'position' => ['x' => 0, 'y' => 1, 'z' => 0]],
            // 1000m in 0.1s => 10,000 m/s, way past 60 m/s max.
            ['timestampMs' => 100, 'position' => ['x' => 1000, 'y' => 1, 'z' => 0]],
        ];

        $result = $this->verifier->verify($session, $run, ['frames' => $frames]);

        $this->assertNotSame(RaceRun::STATUS_ACCEPTED, $result->status);
        $this->assertTrue(in_array('replay_speed_exceeds_max', $result->notes, true) || in_array('replay_possible_teleport', $result->notes, true));
    }

    public function test_flags_teleport(): void
    {
        [$session, $run] = $this->buildSessionAndRun();
        $this->attachSplits($run, RaceSubmissionFixtures::validSplits());

        $frames = [
            ['timestampMs' => 0, 'position' => ['x' => 0, 'y' => 1, 'z' => 0]],
            ['timestampMs' => 100, 'position' => ['x' => 100, 'y' => 1, 'z' => 0]],
        ];

        $result = $this->verifier->verify($session, $run, ['frames' => $frames]);

        $this->assertContains('replay_possible_teleport', $result->notes);
    }

    public function test_rejects_non_finite_replay_values(): void
    {
        [$session, $run] = $this->buildSessionAndRun();
        $this->attachSplits($run, RaceSubmissionFixtures::validSplits());

        $frames = [
            ['timestampMs' => 0, 'position' => ['x' => NAN, 'y' => 1, 'z' => 0]],
        ];

        $result = $this->verifier->verify($session, $run, ['frames' => $frames]);

        $this->assertSame(RaceRun::STATUS_REJECTED, $result->status);
    }

    public function test_rejects_non_monotonic_splits(): void
    {
        [$session, $run] = $this->buildSessionAndRun();
        $this->attachSplits($run, [
            ['gateIndex' => 0, 'timeMs' => 5000],
            ['gateIndex' => 1, 'timeMs' => 4000],
        ]);

        $result = $this->verifier->verify($session, $run, null);

        $this->assertSame(RaceRun::STATUS_REJECTED, $result->status);
        $this->assertContains('splits_non_monotonic:order_or_time', $result->notes);
    }

    public function test_rejects_gate_count_mismatch_signal_when_below_reject_threshold_is_only_suspicious(): void
    {
        [$session, $run] = $this->buildSessionAndRun();
        $this->attachSplits($run, array_slice(RaceSubmissionFixtures::validSplits(), 0, 3));

        $result = $this->verifier->verify($session, $run, null);

        $this->assertNotSame(RaceRun::STATUS_ACCEPTED, $result->status);
        $this->assertNotSame(RaceRun::STATUS_REJECTED, $result->status);
    }

    public function test_rejects_session_nonce_mismatch(): void
    {
        [$session, $run] = $this->buildSessionAndRun();
        $run->session_nonce = 'wrong-nonce';
        $this->attachSplits($run, RaceSubmissionFixtures::validSplits());

        $result = $this->verifier->verify($session, $run, null);

        $this->assertSame(RaceRun::STATUS_REJECTED, $result->status);
    }

    /**
     * @return array{0: RaceSession, 1: RaceRun}
     */
    private function buildSessionAndRun(): array
    {
        $user = User::factory()->create();

        $session = RaceSession::create([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'user_id' => $user->id,
            'course_id' => RaceSubmissionFixtures::COURSE_ID,
            'environment_id' => RaceSubmissionFixtures::ENVIRONMENT_ID,
            'weather_preset_id' => RaceSubmissionFixtures::WEATHER_ID,
            'nonce' => 'test-nonce-123',
            'rules_version' => 1,
            'physics_version' => '1.0.0',
            'status' => RaceSession::STATUS_CONSUMED,
            'expires_at' => now()->addMinutes(15),
        ]);

        $run = new RaceRun([
            'user_id' => $user->id,
            'race_session_id' => $session->id,
            'submission_id' => (string) \Illuminate\Support\Str::uuid(),
            'course_id' => RaceSubmissionFixtures::COURSE_ID,
            'environment_id' => RaceSubmissionFixtures::ENVIRONMENT_ID,
            'weather_preset_id' => RaceSubmissionFixtures::WEATHER_ID,
            'physics_version' => '1.0.0',
            'duration_ms' => 42000,
            'completed' => true,
            'crashed' => false,
            'session_nonce' => 'test-nonce-123',
            'submitted_at' => now(),
        ]);
        $run->save();

        return [$session, $run];
    }

    private function attachSplits(RaceRun $run, array $splits): void
    {
        foreach ($splits as $split) {
            $run->splits()->create(['gate_index' => $split['gateIndex'], 'time_ms' => $split['timeMs']]);
        }

        $run->load('splits');
    }
}
