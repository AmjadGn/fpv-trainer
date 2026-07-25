<?php

namespace App\Domain\Moderation\Services;

use App\Domain\Leaderboards\Services\LeaderboardService;
use App\Domain\Moderation\Models\ModerationAction;
use App\Domain\Races\Models\RaceRun;
use App\Models\User;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;

class ModerationService
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly LeaderboardService $leaderboards,
    ) {
    }

    public function suspendUser(User $admin, User $target, string $reason, ?string $ip = null): User
    {
        return DB::transaction(function () use ($admin, $target, $reason, $ip) {
            $target->update([
                'competitive_status' => User::STATUS_RESTRICTED,
                'suspended_at' => now(),
            ]);

            ModerationAction::create([
                'admin_user_id' => $admin->id,
                'target_user_id' => $target->id,
                'action' => 'suspend',
                'reason' => $reason,
            ]);

            $this->audit->log($admin, 'user.suspend', 'User', (string) $target->id, ['reason' => $reason], $ip);

            return $target;
        });
    }

    public function banUser(User $admin, User $target, string $reason, ?string $ip = null): User
    {
        return DB::transaction(function () use ($admin, $target, $reason, $ip) {
            $target->update([
                'competitive_status' => User::STATUS_BANNED,
                'suspended_at' => now(),
            ]);

            $target->tokens()->delete();

            ModerationAction::create([
                'admin_user_id' => $admin->id,
                'target_user_id' => $target->id,
                'action' => 'ban',
                'reason' => $reason,
            ]);

            $this->audit->log($admin, 'user.ban', 'User', (string) $target->id, ['reason' => $reason], $ip);

            return $target;
        });
    }

    public function reinstateUser(User $admin, User $target, ?string $ip = null): User
    {
        return DB::transaction(function () use ($admin, $target, $ip) {
            $target->update([
                'competitive_status' => User::STATUS_ACTIVE,
                'suspended_at' => null,
            ]);

            ModerationAction::create([
                'admin_user_id' => $admin->id,
                'target_user_id' => $target->id,
                'action' => 'reinstate',
            ]);

            $this->audit->log($admin, 'user.reinstate', 'User', (string) $target->id, [], $ip);

            return $target;
        });
    }

    public function resolveManualReview(User $admin, RaceRun $run, string $decision, ?string $reason = null, ?string $ip = null): RaceRun
    {
        if (!in_array($decision, [RaceRun::STATUS_ACCEPTED, RaceRun::STATUS_REJECTED], true)) {
            throw ApiException::validation('Decision must be "accepted" or "rejected".');
        }

        return DB::transaction(function () use ($admin, $run, $decision, $reason, $ip) {
            $run->update([
                'status' => $decision,
                'verified_at' => now(),
            ]);

            if ($decision === RaceRun::STATUS_ACCEPTED) {
                $this->leaderboards->recordAcceptedRun($run);
            }

            ModerationAction::create([
                'admin_user_id' => $admin->id,
                'target_user_id' => $run->user_id,
                'target_race_run_id' => $run->id,
                'action' => 'manual_review_'.$decision,
                'reason' => $reason,
            ]);

            $this->audit->log($admin, 'run.manual_review', 'RaceRun', (string) $run->id, ['decision' => $decision, 'reason' => $reason], $ip);

            return $run->refresh();
        });
    }
}
