<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class ShareRunRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'visibility' => ['sometimes', 'string', 'in:private,unlisted,public'],
            'title' => ['nullable', 'string', 'max:120'],
        ];
    }
}
