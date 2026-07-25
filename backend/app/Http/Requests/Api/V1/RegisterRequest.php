<?php

namespace App\Http\Requests\Api\V1;

use App\Domain\Identity\Rules\Username;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'displayName' => ['required', 'string', 'min:2', 'max:60'],
            'username' => ['required', 'string', new Username(), 'unique:users,username'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', Password::min(8), 'confirmed'],
            'countryCode' => ['nullable', 'string', 'size:2'],
            'acceptedTerms' => ['required', 'accepted'],
            'inviteCode' => [config('fpv.beta.mode') === 'invite_only' ? 'required' : 'nullable', 'string', 'max:64'],
        ];
    }
}
