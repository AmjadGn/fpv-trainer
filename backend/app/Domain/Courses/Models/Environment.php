<?php

namespace App\Domain\Courses\Models;

use Illuminate\Database\Eloquent\Model;

class Environment extends Model
{
    protected $table = 'environments';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'version', 'name', 'enabled', 'theme'];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
        ];
    }
}
