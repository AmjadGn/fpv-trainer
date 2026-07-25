<?php

namespace App\Domain\Courses\Models;

use Illuminate\Database\Eloquent\Model;

class WeatherPreset extends Model
{
    protected $table = 'weather_presets';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'version', 'environment_id', 'category', 'competitive',
        'enabled', 'deterministic_config_hash', 'environments',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'competitive' => 'boolean',
            'environments' => 'array',
        ];
    }
}
