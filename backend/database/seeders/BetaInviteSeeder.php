<?php

namespace Database\Seeders;

use App\Domain\Beta\BetaInvite;
use Illuminate\Database\Seeder;

class BetaInviteSeeder extends Seeder
{
    public function run(): void { BetaInvite::updateOrCreate(['code' => 'FPV-LOCAL-0-6'], ['usage_limit' => 100, 'enabled' => true, 'campaign' => 'local-demo']); }
}
