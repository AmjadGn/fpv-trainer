<?php

namespace App\Domain\Courses\Services;

use Illuminate\Support\Facades\Cache;
use RuntimeException;

/**
 * Reads the monorepo-shared JSON catalog (shared/catalog/*.json) which is
 * the single source of truth for environments, courses, weather presets,
 * achievements, and version pins. Results are memoized per-request and
 * cached briefly to avoid re-parsing JSON on every call.
 *
 * The optional DB mirror tables (environments/courses/weather_presets) are
 * populated by CatalogSeeder for admin/reporting convenience only — this
 * service never reads from them, so the catalog JSON can be redeployed
 * without a migration.
 */
class CatalogService
{
    private const CACHE_TTL_SECONDS = 300;

    /** @var array<string, array> */
    private array $memo = [];

    public function __construct(private readonly string $catalogPath)
    {
    }

    public function manifest(): array
    {
        return $this->read('manifest');
    }

    /** @return array<int, array<string, mixed>> */
    public function environments(): array
    {
        return $this->read('environments')['environments'] ?? [];
    }

    public function environment(string $id): ?array
    {
        return $this->firstWhereId($this->environments(), $id);
    }

    /** @return array<int, array<string, mixed>> */
    public function courses(): array
    {
        return $this->read('courses')['courses'] ?? [];
    }

    public function course(string $id): ?array
    {
        return $this->firstWhereId($this->courses(), $id);
    }

    /** @return array<int, array<string, mixed>> */
    public function weatherPresets(): array
    {
        return $this->read('weather-presets')['weatherPresets'] ?? [];
    }

    public function weatherPreset(string $id): ?array
    {
        return $this->firstWhereId($this->weatherPresets(), $id);
    }

    /** @return array<int, array<string, mixed>> */
    public function achievements(): array
    {
        return $this->read('achievements')['achievements'] ?? [];
    }

    public function achievement(string $id): ?array
    {
        return $this->firstWhereId($this->achievements(), $id);
    }

    public function challengeRotation(): array
    {
        return $this->read('challenge-rotation');
    }

    /** @return array<int, array<string, mixed>> */
    public function dailyChallengePool(): array
    {
        return $this->challengeRotation()['dailyPool'] ?? [];
    }

    /** @return array<int, array<string, mixed>> */
    public function weeklyChallengePool(): array
    {
        return $this->challengeRotation()['weeklyPool'] ?? [];
    }

    public function findChallengeDefinition(string $slug): ?array
    {
        $all = array_merge($this->dailyChallengePool(), $this->weeklyChallengePool());

        return $this->firstWhereSlug($all, $slug);
    }

    /**
     * A weather preset is usable on an environment if `environments` is "*"
     * or contains the environment id.
     */
    public function isWeatherPresetForEnvironment(array $weatherPreset, string $environmentId): bool
    {
        $environments = $weatherPreset['environments'] ?? '*';

        if ($environments === '*') {
            return true;
        }

        return is_array($environments) && in_array($environmentId, $environments, true);
    }

    public function isCourseCompetitive(string $courseId): bool
    {
        $course = $this->course($courseId);

        return $course !== null && ($course['enabled'] ?? false) && ($course['competitive'] ?? false);
    }

    private function read(string $name): array
    {
        if (isset($this->memo[$name])) {
            return $this->memo[$name];
        }

        $cacheKey = "fpv.catalog.{$name}";

        $data = Cache::remember($cacheKey, self::CACHE_TTL_SECONDS, function () use ($name) {
            return $this->readFromDisk($name);
        });

        return $this->memo[$name] = $data;
    }

    private function readFromDisk(string $name): array
    {
        $path = rtrim($this->catalogPath, '/').'/'.$name.'.json';

        if (!is_file($path)) {
            throw new RuntimeException("Catalog file not found: {$path}");
        }

        $contents = file_get_contents($path);

        if ($contents === false) {
            throw new RuntimeException("Unable to read catalog file: {$path}");
        }

        $decoded = json_decode($contents, true);

        if (!is_array($decoded)) {
            throw new RuntimeException("Catalog file is not valid JSON: {$path}");
        }

        return $decoded;
    }

    /** @param array<int, array<string, mixed>> $items */
    private function firstWhereId(array $items, string $id): ?array
    {
        foreach ($items as $item) {
            if (($item['id'] ?? null) === $id) {
                return $item;
            }
        }

        return null;
    }

    /** @param array<int, array<string, mixed>> $items */
    private function firstWhereSlug(array $items, string $slug): ?array
    {
        foreach ($items as $item) {
            if (($item['slug'] ?? null) === $slug) {
                return $item;
            }
        }

        return null;
    }

    public function clearMemo(): void
    {
        $this->memo = [];
    }
}
