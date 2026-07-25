<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class ProgressSyncRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'progress' => ['sometimes', 'array'],
            'trainingProgress' => ['sometimes', 'array'],
            'achievementsUnlocked' => ['sometimes', 'array'],
            'achievementsUnlocked.*' => ['string'],
        ];
    }
}
