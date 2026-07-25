<?php

namespace App\Domain\Courses\Models;

use Illuminate\Database\Eloquent\Model;

class Course extends Model
{
    protected $table = 'courses';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'version', 'environment_id', 'name', 'difficulty', 'gate_count',
        'enabled', 'competitive', 'current_rules_version',
        'min_plausible_duration_ms', 'max_duration_ms', 'min_segment_ms',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'competitive' => 'boolean',
        ];
    }
}
