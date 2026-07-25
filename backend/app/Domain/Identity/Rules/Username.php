<?php

namespace App\Domain\Identity\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class Username implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!is_string($value)) {
            $fail('The :attribute must be a string.');

            return;
        }

        if (strtolower($value) !== $value) {
            $fail('The :attribute must be lowercase.');

            return;
        }

        if (!preg_match('/^[a-z0-9_]{3,24}$/', $value)) {
            $fail('The :attribute must be 3-24 characters and contain only lowercase letters, numbers, and underscores.');

            return;
        }

        if (in_array($value, config('fpv.reserved_usernames', []), true)) {
            $fail('The :attribute is reserved and cannot be used.');
        }
    }
}
