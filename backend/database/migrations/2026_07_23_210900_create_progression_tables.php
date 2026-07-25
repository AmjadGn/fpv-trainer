<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('level')->default(1);
            $table->unsignedBigInteger('experience_points')->default(0);
            $table->unsignedInteger('gold_medals')->default(0);
            $table->unsignedInteger('silver_medals')->default(0);
            $table->unsignedInteger('bronze_medals')->default(0);
            $table->unsignedInteger('completed_races')->default(0);
            $table->unsignedBigInteger('total_flight_time_ms')->default(0);
            $table->unsignedBigInteger('gates_completed')->default(0);
            $table->unsignedInteger('crashes')->default(0);
            $table->json('best_times')->nullable();
            $table->json('completed_training_modules')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
        });

        Schema::create('training_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('module_id');
            $table->unsignedInteger('module_version')->default(1);
            $table->boolean('completed')->default(false);
            $table->string('highest_medal', 8)->nullable();
            $table->unsignedInteger('best_score')->default(0);
            $table->unsignedInteger('best_duration_ms')->nullable();
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('last_played_at')->nullable();
            $table->json('best_metrics')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'module_id']);
        });

        Schema::create('user_achievements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('achievement_id');
            $table->timestamp('unlocked_at');
            $table->string('source', 8)->default('client'); // client|server
            $table->timestamps();

            $table->unique(['user_id', 'achievement_id']);
        });

        Schema::create('progress_sync_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('event_type', 16); // merge|sync
            $table->string('payload_hash', 64)->nullable();
            $table->json('summary')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('progress_sync_events');
        Schema::dropIfExists('user_achievements');
        Schema::dropIfExists('training_progress');
        Schema::dropIfExists('player_progress');
    }
};
