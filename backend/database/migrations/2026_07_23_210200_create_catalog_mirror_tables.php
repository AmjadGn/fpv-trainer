<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Read-mostly mirror of shared/catalog/*.json, kept in sync by CatalogSeeder /
 * `php artisan fpv:catalog-sync`. The JSON files remain the source of truth
 * (see App\Domain\Courses\Services\CatalogService); these tables exist so
 * admin tooling and reporting can join against SQL without parsing JSON.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('environments', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->unsignedInteger('version')->default(1);
            $table->string('name');
            $table->boolean('enabled')->default(true);
            $table->string('theme')->nullable();
            $table->timestamps();
        });

        Schema::create('courses', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->unsignedInteger('version')->default(1);
            $table->string('environment_id');
            $table->string('name');
            $table->string('difficulty')->nullable();
            $table->unsignedSmallInteger('gate_count');
            $table->boolean('enabled')->default(true);
            $table->boolean('competitive')->default(true);
            $table->unsignedInteger('current_rules_version')->default(1);
            $table->unsignedInteger('min_plausible_duration_ms');
            $table->unsignedInteger('max_duration_ms');
            $table->unsignedInteger('min_segment_ms');
            $table->timestamps();

            $table->index('environment_id');
        });

        Schema::create('weather_presets', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->unsignedInteger('version')->default(1);
            $table->string('environment_id')->nullable();
            $table->string('category')->default('standard');
            $table->boolean('competitive')->default(true);
            $table->boolean('enabled')->default(true);
            $table->string('deterministic_config_hash')->nullable();
            $table->json('environments')->nullable();
            $table->timestamps();

            $table->index('environment_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('weather_presets');
        Schema::dropIfExists('courses');
        Schema::dropIfExists('environments');
    }
};
