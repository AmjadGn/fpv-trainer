<?php

namespace App\Domain\Identity\Services;

use Illuminate\Support\Facades\Password;

/**
 * Thin wrapper around Laravel's built-in password broker so controllers
 * don't talk to the `Password` facade directly. Mail is sent through the
 * configured MAIL_MAILER (log driver in local/dev/test by default).
 */
class PasswordResetService
{
    public function sendResetLink(string $email): void
    {
        // Always report success to the caller (generic response, no
        // enumeration) — the broker itself silently no-ops for unknown
        // emails, we just never surface that distinction over the API.
        Password::sendResetLink(['email' => strtolower($email)]);
    }

    public function reset(string $email, string $token, string $password): bool
    {
        $status = Password::reset(
            [
                'email' => strtolower($email),
                'token' => $token,
                'password' => $password,
                'password_confirmation' => $password,
            ],
            function ($user) use ($password) {
                $user->forceFill([
                    'password' => \Illuminate\Support\Facades\Hash::make($password),
                ])->setRememberToken(\Illuminate\Support\Str::random(60));

                $user->save();
                $user->tokens()->delete();
            }
        );

        return $status === Password::PASSWORD_RESET;
    }
}
