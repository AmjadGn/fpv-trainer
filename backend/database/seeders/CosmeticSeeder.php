<?php

namespace Database\Seeders;

use App\Domain\Cosmetics\Models\CosmeticDefinition;
use Illuminate\Database\Seeder;

class CosmeticSeeder extends Seeder
{
    public function run(): void
    {
        foreach ([['default-frame', 'frame', 'Default Frame'], ['default-props', 'prop', 'Default Props'], ['default-trail', 'trail', 'Default Trail']] as [$key, $category, $name]) {
            CosmeticDefinition::updateOrCreate(['key' => $key], ['category' => $category, 'name' => $name, 'default_owned' => true, 'enabled' => true]);
        }
    }
}
