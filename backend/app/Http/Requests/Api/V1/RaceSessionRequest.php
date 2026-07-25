<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class RaceSessionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'courseId' => ['required', 'string', 'max:100'],
            'weatherPresetId' => ['required', 'string', 'max:100'],
            'clientBuildVersion' => ['nullable', 'string', 'max:32'],
            'physicsVersion' => ['nullable', 'string', 'max:32'],
        ];
    }
}
