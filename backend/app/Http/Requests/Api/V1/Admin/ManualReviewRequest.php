<?php

namespace App\Http\Requests\Api\V1\Admin;

use Illuminate\Foundation\Http\FormRequest;

class ManualReviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'decision' => ['required', 'string', 'in:accepted,rejected'],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
