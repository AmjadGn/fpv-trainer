<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Builds the consistent API error envelope used across the whole app:
 *
 *   { "error": { "code", "message", "details", "requestId" } }
 */
class ApiError
{
    public static function response(
        string $code,
        string $message,
        int $status = 400,
        array $details = [],
        ?Request $request = null,
    ): JsonResponse {
        $request ??= request();

        return new JsonResponse([
            'error' => [
                'code' => $code,
                'message' => $message,
                'details' => $details,
                'requestId' => self::requestId($request),
            ],
        ], $status);
    }

    public static function requestId(?Request $request = null): string
    {
        $request ??= request();

        $existing = $request?->attributes->get('request_id');

        if (is_string($existing) && $existing !== '') {
            return $existing;
        }

        return (string) Str::uuid();
    }
}
