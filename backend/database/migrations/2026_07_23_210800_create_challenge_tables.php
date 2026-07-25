<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('challenge_definitions', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('environment_id');
            $table->string('course_id');
            $table->string('weather_preset_id');
            $table->string('scoring_type', 32)->default('fastest_time');
            $table->unsignedInteger('xp_reward')->default(0);
            $table->json('medal_thresholds_ms')->nullable();
            $table->string('pool', 16); // daily|weekly
            $table->timestamps();
        });

        Schema::create('challenge_instances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('challenge_definition_id')->constrained()->cascadeOnDelete();
            $table->string('pool', 16);
            $table->string('period', 16); // e.g. 2026-07-23 or 2026-W30
            $table->string('seed', 64);
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->string('status', 16)->default('active');
            $table->timestamps();

            $table->unique(['pool', 'period']);
            $table->index(['pool', 'status']);
        });

        Schema::create('challenge_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('challenge_instance_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('race_run_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('best_duration_ms');
            $table->string('medal', 8)->nullable();
            $table->unsignedInteger('xp_awarded')->default(0);
            $table->timestamps();

            $table->unique(['challenge_instance_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('challenge_results');
        Schema::dropIfExists('challenge_instances');
        Schema::dropIfExists('challenge_definitions');
    }
};
