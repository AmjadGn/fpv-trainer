<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'displayName' => ['sometimes', 'string', 'min:2', 'max:60'],
            'bio' => ['sometimes', 'nullable', 'string', 'max:500'],
            'avatarUrl' => ['sometimes', 'nullable', 'string', 'url', 'max:2048'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2'],
            'homeEnvironmentId' => ['sometimes', 'nullable', 'string', 'max:100'],
            'isPublic' => ['sometimes', 'boolean'],
        ];
    }
}
