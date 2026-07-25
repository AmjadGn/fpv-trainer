<?php

namespace Database\Seeders;

use App\Domain\Progression\Models\PlayerProgress;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::updateOrCreate(
            ['email' => 'admin@fpv-trainer.test'],
            [
                'name' => 'FPV Trainer Admin',
                'username' => 'admin',
                'display_name' => 'FPV Trainer Admin',
                'password' => Hash::make('password'),
                'email_verified_at' => now(),
                'competitive_status' => User::STATUS_ACTIVE,
                'accepted_terms_at' => now(),
                'is_admin' => true,
            ],
        );

        $admin->pilotProfile()->firstOrCreate([], ['is_public' => false]);
        PlayerProgress::firstOrCreate(['user_id' => $admin->id]);

        $this->command?->info('Admin user ready: admin@fpv-trainer.test / password');
    }
}
