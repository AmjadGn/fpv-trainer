<?php

namespace Database\Seeders;

use App\Domain\Missions\Models\SeasonMission;
use App\Domain\Seasons\Models\Season;
use App\Domain\Seasons\Services\SeasonLifecycleService;
use Illuminate\Database\Seeder;

class SeasonSeeder extends Seeder
{
    public function run(): void
    {
        $season = Season::updateOrCreate(['slug' => 'demo-season-0-6'], ['name' => 'Demo Season 0.6', 'description' => 'Local competitive demo season.', 'status' => Season::STATUS_ACTIVE, 'starts_at' => now()->subDay(), 'ends_at' => now()->addMonths(2), 'registration_starts_at' => now()->subWeek(), 'registration_ends_at' => now()->addMonth(), 'physics_version' => config('fpv.physics_version'), 'catalog_version' => config('fpv.catalog_version'), 'is_primary' => true, 'published_at' => now()]);
        app(SeasonLifecycleService::class)->seedDivisions($season);
        foreach (range(1, 10) as $number) {
            SeasonMission::updateOrCreate(['season_id' => $season->id, 'key' => "demo-mission-{$number}"], ['title' => "Demo Mission {$number}", 'description' => 'Complete ranked runs to make progress.', 'category' => 'racing', 'progress_type' => 'ranked_run_accepted', 'target_value' => $number, 'reward_xp' => 100 * $number, 'reward_season_points' => 10 * $number, 'enabled' => true]);
        }
    }
}
