<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leaderboard_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('course_id');
            // Empty string (not null) represents the "overall" board so the
            // unique index below behaves consistently across SQLite/MySQL/
            // Postgres (which treat NULL as distinct on unique indexes).
            $table->string('weather_preset_id')->default('');
            $table->foreignId('race_run_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('best_duration_ms');
            $table->unsignedInteger('rules_version')->default(1);
            $table->timestamps();

            $table->unique(['user_id', 'course_id', 'weather_preset_id'], 'leaderboard_unique_dimensions');
            $table->index(['course_id', 'weather_preset_id', 'best_duration_ms']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leaderboard_entries');
    }
};
