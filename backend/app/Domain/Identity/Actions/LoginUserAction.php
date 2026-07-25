<?php

namespace App\Domain\Identity\Actions;

use App\Models\User;
use App\Support\ApiException;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\NewAccessToken;

class LoginUserAction
{
    /**
     * @return array{user: User, token: NewAccessToken}
     */
    public function execute(string $identifier, string $password, ?string $deviceName = null): array
    {
        $identifier = strtolower(trim($identifier));

        $user = str_contains($identifier, '@')
            ? User::where('email', $identifier)->first()
            : User::where('username', $identifier)->first();

        // Generic message regardless of which check failed, to avoid
        // leaking whether an account exists (no enumeration).
        if (!$user || !Hash::check($password, $user->password)) {
            throw ApiException::make('invalid_credentials', 'The provided credentials are incorrect.', 401);
        }

        if ($user->competitive_status === User::STATUS_BANNED) {
            throw ApiException::make('account_suspended', 'This account is not able to sign in.', 403);
        }

        $token = $user->createToken($deviceName ?: 'api');

        return ['user' => $user, 'token' => $token];
    }
}
