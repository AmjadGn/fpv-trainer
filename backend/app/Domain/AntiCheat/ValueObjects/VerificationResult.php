<?php

namespace App\Domain\AntiCheat\ValueObjects;

class VerificationResult
{
    /**
     * @param list<string> $notes Human-readable signal descriptions, stored for audit/manual review.
     */
    public function __construct(
        public readonly string $status,
        public readonly int $suspicionScore,
        public readonly array $notes,
    ) {
    }

    public static function make(string $status, int $suspicionScore, array $notes): self
    {
        return new self($status, $suspicionScore, $notes);
    }
}
