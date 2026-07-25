<?php

namespace App\Domain\Identity\Actions;

use App\Domain\Progression\Models\PlayerProgress;
use App\Domain\Beta\BetaInviteService;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class RegisterUserAction
{
    /**
     * @param array{displayName: string, username: string, email: string, password: string, countryCode?: string|null} $data
     */
    public function __construct(private readonly BetaInviteService $invites) {}

    public function execute(array $data): User
    {
        return DB::transaction(function () use ($data) {
            if (config('fpv.beta.mode') === 'invite_only') {
                $this->invites->validateAndConsume((string) ($data['inviteCode'] ?? ''), $data['email']);
            }

            $user = User::create([
                'name' => $data['displayName'],
                'display_name' => $data['displayName'],
                'username' => strtolower($data['username']),
                'email' => strtolower($data['email']),
                'password' => Hash::make($data['password']),
                'country_code' => $data['countryCode'] ?? null,
                'competitive_status' => User::STATUS_ACTIVE,
                'accepted_terms_at' => now(),
            ]);

            $user->pilotProfile()->create([
                'is_public' => true,
            ]);

            PlayerProgress::create([
                'user_id' => $user->id,
            ]);

            return $user;
        });
    }
}
