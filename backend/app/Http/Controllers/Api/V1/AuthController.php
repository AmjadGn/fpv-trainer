<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Identity\Actions\LoginUserAction;
use App\Domain\Identity\Actions\RegisterUserAction;
use App\Domain\Identity\Services\PasswordResetService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\LoginRequest;
use App\Http\Requests\Api\V1\RegisterRequest;
use App\Models\User;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function register(RegisterRequest $request, RegisterUserAction $action): JsonResponse
    {
        $user = $action->execute($request->validated());

        $token = $user->createToken('api');

        return response()->json([
            'user' => $this->serializeUser($user),
            'token' => $token->plainTextToken,
        ], 201);
    }

    public function login(LoginRequest $request, LoginUserAction $action): JsonResponse
    {
        $result = $action->execute(
            $request->input('identifier'),
            $request->input('password'),
            $request->input('deviceName'),
        );

        return response()->json([
            'user' => $this->serializeUser($result['user']),
            'token' => $result['token']->plainTextToken,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();

        if ($token && method_exists($token, 'delete')) {
            $token->delete();
        }

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->serializeUser($request->user())]);
    }

    public function forgotPassword(Request $request, PasswordResetService $service): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        $service->sendResetLink($request->input('email'));

        // Always the same generic response, regardless of whether the
        // email exists, to avoid account enumeration.
        return response()->json(['message' => 'If an account exists for that email, a reset link has been sent.']);
    }

    public function resetPassword(Request $request, PasswordResetService $service): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string'],
            'password' => ['required', 'string', Password::min(8), 'confirmed'],
        ]);

        $success = $service->reset($request->input('email'), $request->input('token'), $request->input('password'));

        if (!$success) {
            throw ApiException::make('invalid_reset_token', 'This password reset link is invalid or has expired.', 422);
        }

        return response()->json(['message' => 'Password has been reset.']);
    }

    private function serializeUser(User $user): array
    {
        return [
            'id' => $user->id,
            'username' => $user->username,
            'displayName' => $user->display_name,
            'email' => $user->email,
            'countryCode' => $user->country_code,
            'competitiveStatus' => $user->competitive_status,
            'isAdmin' => (bool) $user->is_admin,
            'emailVerifiedAt' => optional($user->email_verified_at)->toIso8601String(),
        ];
    }
}
