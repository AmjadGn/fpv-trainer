<?php

namespace App\Support;

use RuntimeException;
use Throwable;

/**
 * Domain-level exception carrying enough information to render a consistent
 * ApiError response. Throw this from Actions/Services instead of returning
 * ad-hoc error arrays from controllers.
 */
class ApiException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 400,
        public readonly array $details = [],
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }

    public static function make(string $errorCode, string $message, int $status = 400, array $details = []): self
    {
        return new self($errorCode, $message, $status, $details);
    }

    public static function notFound(string $message = 'Resource not found.', array $details = []): self
    {
        return new self('not_found', $message, 404, $details);
    }

    public static function forbidden(string $message = 'You do not have permission to perform this action.'): self
    {
        return new self('forbidden', $message, 403);
    }

    public static function unauthorized(string $message = 'Authentication required.'): self
    {
        return new self('unauthorized', $message, 401);
    }

    public static function conflict(string $message, array $details = []): self
    {
        return new self('conflict', $message, 409, $details);
    }

    public static function validation(string $message, array $details = []): self
    {
        return new self('validation_failed', $message, 422, $details);
    }

    public function render()
    {
        return ApiError::response($this->errorCode, $this->getMessage(), $this->status, $this->details);
    }
}
