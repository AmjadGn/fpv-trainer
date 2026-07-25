<?php

namespace Database\Seeders;

use App\Domain\Features\FeatureFlag;
use App\Domain\Features\FeatureFlagService;
use Illuminate\Database\Seeder;

class FeatureFlagSeeder extends Seeder
{
    public function run(): void
    {
        foreach (array_keys(FeatureFlagService::DEFAULTS) as $key) FeatureFlag::updateOrCreate(['key' => $key], ['enabled' => true, 'targeting' => 'global']);
    }
}
