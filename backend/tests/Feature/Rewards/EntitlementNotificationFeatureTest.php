<?php

namespace Tests\Feature\Rewards;

use App\Domain\Cosmetics\Models\CosmeticDefinition;
use App\Domain\Cosmetics\Services\CosmeticService;
use App\Domain\Notifications\Services\NotificationService;
use App\Domain\Features\FeatureFlag;
use App\Domain\Features\FeatureFlagService;
use App\Domain\Beta\BetaInvite;
use App\Domain\Beta\BetaInviteService;
use App\Domain\Integrity\Services\LeaderboardIntegrityService;
use App\Domain\Rewards\Services\EntitlementService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EntitlementNotificationFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_entitlement_grant_once_and_cosmetic_equip_rules(): void
    {
        $user = User::factory()->create();
        $entitlements = app(EntitlementService::class);
        $cosmetics = app(CosmeticService::class);

        CosmeticDefinition::create([
            'key' => 'drone-default',
            'category' => 'live_drone',
            'name' => 'Default Drone',
            'default_owned' => true,
            'enabled' => true,
            'material_preset_json' => ['body' => '#2ec4b6'],
        ]);
        CosmeticDefinition::create([
            'key' => 'drone-gold',
            'category' => 'live_drone',
            'name' => 'Gold Drone',
            'default_owned' => false,
            'enabled' => true,
            'material_preset_json' => ['body' => '#d4af37'],
        ]);

        $entitlements->grantOnce($user, 'cosmetic', 'drone-gold', 'season', '1');
        $entitlements->grantOnce($user, 'cosmetic', 'drone-gold', 'season', '1');
        $this->assertSame(1, \App\Domain\Rewards\Models\UserEntitlement::where('user_id', $user->id)->count());

        $cosmetics->equip($user, 'live_drone', 'drone-default');
        $cosmetics->equip($user, 'live_drone', 'drone-gold');

        $this->expectException(\App\Support\ApiException::class);
        $other = User::factory()->create();
        $cosmetics->equip($other, 'live_drone', 'drone-gold');
    }

    public function test_notifications_read_and_isolation(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $notifications = app(NotificationService::class);
        $n = $notifications->create($a, 'submission_accepted', 'Accepted', 'Your run was accepted.', '/season');
        $notifications->create($b, 'submission_accepted', 'Accepted', 'Other', null);

        $token = $a->createToken('t')->plainTextToken;
        $list = $this->withToken($token)->getJson('/api/v1/notifications')->assertOk();
        $this->assertCount(1, $list->json('data'));
        $this->withToken($token)->postJson("/api/v1/notifications/{$n->id}/read")->assertOk();
        $this->assertNotNull($n->fresh()->read_at);

        $this->withToken($token)->postJson('/api/v1/notifications/read-all')->assertOk();
    }

    public function test_feature_flags_and_beta_invite_limits(): void
    {
        FeatureFlag::create([
            'key' => 'seasons_enabled',
            'enabled' => true,
            'targeting' => 'global',
        ]);

        $flags = app(FeatureFlagService::class)->getFlags();
        $this->assertTrue($flags['seasons_enabled']);

        $this->getJson('/api/v1/features')->assertOk()->assertJsonPath('features.seasons_enabled', true);

        $invite = BetaInvite::create([
            'code' => 'BETA-ONE',
            'usage_limit' => 1,
            'usage_count' => 0,
            'expires_at' => now()->addDay(),
            'enabled' => true,
        ]);

        $service = app(BetaInviteService::class);
        $service->validateAndConsume('BETA-ONE', 'a@example.com');
        $this->assertSame(1, $invite->fresh()->usage_count);

        $this->expectException(\App\Support\ApiException::class);
        $service->validateAndConsume('BETA-ONE', 'b@example.com');
    }

    public function test_leaderboard_audit_dry_run(): void
    {
        $audit = app(LeaderboardIntegrityService::class)->audit(true);
        $this->assertTrue($audit->dry_run);
        $this->assertSame('completed', $audit->status);
    }
}
