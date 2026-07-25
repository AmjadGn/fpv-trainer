<?php

namespace Database\Seeders;

use App\Domain\Courses\Models\Course;
use App\Domain\Courses\Models\Environment;
use App\Domain\Courses\Models\WeatherPreset;
use App\Domain\Courses\Services\CatalogService;
use Illuminate\Database\Seeder;

/**
 * Mirrors shared/catalog/*.json into the DB tables for admin/reporting
 * convenience. CatalogService (the runtime source of truth) never reads
 * these tables, so re-running this seeder is always safe.
 */
class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        $catalog = app(CatalogService::class);
        $catalog->clearMemo();

        foreach ($catalog->environments() as $environment) {
            Environment::updateOrCreate(
                ['id' => $environment['id']],
                [
                    'version' => $environment['version'] ?? 1,
                    'name' => $environment['name'],
                    'enabled' => $environment['enabled'] ?? true,
                    'theme' => $environment['theme'] ?? null,
                ],
            );
        }

        foreach ($catalog->courses() as $course) {
            Course::updateOrCreate(
                ['id' => $course['id']],
                [
                    'version' => $course['version'] ?? 1,
                    'environment_id' => $course['environmentId'],
                    'name' => $course['name'],
                    'difficulty' => $course['difficulty'] ?? null,
                    'gate_count' => $course['gateCount'],
                    'enabled' => $course['enabled'] ?? true,
                    'competitive' => $course['competitive'] ?? true,
                    'current_rules_version' => $course['currentRulesVersion'] ?? 1,
                    'min_plausible_duration_ms' => $course['minPlausibleDurationMs'],
                    'max_duration_ms' => $course['maxDurationMs'],
                    'min_segment_ms' => $course['minSegmentMs'],
                ],
            );
        }

        foreach ($catalog->weatherPresets() as $weather) {
            WeatherPreset::updateOrCreate(
                ['id' => $weather['id']],
                [
                    'version' => $weather['version'] ?? 1,
                    'environment_id' => $weather['environmentId'] ?? null,
                    'category' => $weather['category'] ?? 'standard',
                    'competitive' => $weather['competitive'] ?? true,
                    'enabled' => $weather['enabled'] ?? true,
                    'deterministic_config_hash' => $weather['deterministicConfigHash'] ?? null,
                    'environments' => is_array($weather['environments'] ?? null) ? $weather['environments'] : null,
                ],
            );
        }

        $this->command?->info('Catalog mirror tables synced from shared/catalog JSON.');
    }
}
