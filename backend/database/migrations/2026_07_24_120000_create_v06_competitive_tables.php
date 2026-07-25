<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('race_sessions', function (Blueprint $table) {
            $table->string('context_type', 32)->nullable()->after('ip_address');
            $table->unsignedBigInteger('context_id')->nullable()->after('context_type');
            $table->string('mode', 16)->default('ranked')->after('context_id');
            $table->json('context_metadata')->nullable()->after('mode');
            $table->index(['context_type', 'context_id']);
        });

        Schema::table('race_runs', function (Blueprint $table) {
            $table->string('context_type', 32)->nullable()->after('client_metadata');
            $table->unsignedBigInteger('context_id')->nullable()->after('context_type');
            $table->index(['context_type', 'context_id', 'status']);
        });

        Schema::table('replay_records', function (Blueprint $table) {
            $table->string('retention_category', 32)->default('accepted_competitive')->after('purge_after');
            $table->boolean('benchmark_eligible')->default(false)->after('retention_category');
            $table->boolean('integrity_ok')->nullable()->after('benchmark_eligible');
            $table->timestamp('integrity_checked_at')->nullable()->after('integrity_ok');
        });

        Schema::create('seasons', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('status', 24)->default('draft');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->timestamp('registration_starts_at')->nullable();
            $table->timestamp('registration_ends_at')->nullable();
            $table->unsignedInteger('rules_version')->default(1);
            $table->unsignedInteger('catalog_version')->default(1);
            $table->string('physics_version')->default('1.0.0');
            $table->string('featured_environment_id')->nullable();
            $table->json('reward_configuration_json')->nullable();
            $table->json('division_configuration_json')->nullable();
            $table->json('mission_configuration_json')->nullable();
            $table->json('leaderboard_configuration_json')->nullable();
            $table->boolean('is_primary')->default(true);
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'starts_at']);
            $table->index(['is_primary', 'status']);
        });

        Schema::create('season_divisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('season_id')->constrained('seasons')->cascadeOnDelete();
            $table->string('key', 32);
            $table->string('name');
            $table->unsignedInteger('order')->default(0);
            $table->unsignedInteger('minimum_rating')->default(0);
            $table->unsignedInteger('maximum_rating')->nullable();
            $table->unsignedInteger('promotion_threshold');
            $table->unsignedInteger('demotion_threshold')->nullable();
            $table->string('badge_style', 64)->nullable();
            $table->decimal('reward_multiplier', 5, 2)->default(1.00);
            $table->boolean('enabled')->default(true);
            $table->timestamps();
            $table->unique(['season_id', 'key']);
            $table->index(['season_id', 'order']);
        });

        Schema::create('season_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('season_id')->constrained('seasons')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('joined_at');
            $table->foreignId('current_division_id')->nullable()->constrained('season_divisions')->nullOnDelete();
            $table->foreignId('highest_division_id')->nullable()->constrained('season_divisions')->nullOnDelete();
            $table->unsignedInteger('current_rating')->default(1000);
            $table->unsignedInteger('peak_rating')->default(1000);
            $table->string('placement_status', 24)->default('unplaced');
            $table->unsignedTinyInteger('placement_runs_completed')->default(0);
            $table->unsignedInteger('total_ranked_runs')->default(0);
            $table->unsignedInteger('accepted_ranked_runs')->default(0);
            $table->unsignedInteger('rejected_ranked_runs')->default(0);
            $table->unsignedInteger('wins')->default(0);
            $table->unsignedInteger('personal_bests')->default(0);
            $table->unsignedInteger('seasonal_points')->default(0);
            $table->unsignedInteger('mission_points')->default(0);
            $table->unsignedInteger('final_rank')->nullable();
            $table->decimal('final_percentile', 6, 3)->nullable();
            $table->string('reward_status', 24)->default('pending');
            $table->timestamp('last_promotion_at')->nullable();
            $table->timestamp('demotion_protection_until')->nullable();
            $table->timestamp('left_at')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();
            $table->unique(['season_id', 'user_id']);
            $table->index(['season_id', 'current_rating']);
            $table->index(['season_id', 'seasonal_points']);
            $table->index(['season_id', 'mission_points']);
            $table->index(['season_id', 'current_division_id', 'current_rating']);
        });

        Schema::create('season_rating_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('season_id')->constrained('seasons')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('source_type', 64);
            $table->string('source_id', 64);
            $table->unsignedInteger('previous_rating');
            $table->integer('delta');
            $table->unsignedInteger('new_rating');
            $table->string('reason_code', 64);
            $table->json('metadata_json')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['season_id', 'user_id', 'source_type', 'source_id'], 'season_rating_source_unique');
            $table->index(['season_id', 'user_id', 'created_at']);
        });

        Schema::create('season_missions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('season_id')->constrained('seasons')->cascadeOnDelete();
            $table->string('key', 64);
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('category', 32);
            $table->string('progress_type', 64);
            $table->unsignedInteger('target_value');
            $table->unsignedInteger('reward_xp')->default(0);
            $table->unsignedInteger('reward_season_points')->default(0);
            $table->string('reward_cosmetic_key')->nullable();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->boolean('repeatable')->default(false);
            $table->boolean('enabled')->default(true);
            $table->json('configuration_json')->nullable();
            $table->timestamps();
            $table->unique(['season_id', 'key']);
            $table->index(['season_id', 'enabled']);
        });

        Schema::create('season_mission_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mission_id')->constrained('season_missions')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('progress_value')->default(0);
            $table->unsignedInteger('progress_version')->default(0);
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('reward_claimed_at')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();
            $table->unique(['mission_id', 'user_id']);
        });

        Schema::create('tournaments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('season_id')->nullable()->constrained('seasons')->nullOnDelete();
            $table->string('slug')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('status', 24)->default('draft');
            $table->string('format', 32)->default('open_time_trial');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->timestamp('registration_starts_at')->nullable();
            $table->timestamp('registration_ends_at')->nullable();
            $table->unsignedInteger('max_attempts')->nullable();
            $table->string('environment_id');
            $table->string('course_id');
            $table->unsignedInteger('course_version')->default(1);
            $table->string('weather_preset_id');
            $table->unsignedBigInteger('weather_seed')->nullable();
            $table->unsignedInteger('rules_version')->default(1);
            $table->string('physics_version')->default('1.0.0');
            $table->string('scoring_type', 32)->default('fastest_time');
            $table->boolean('count_rejected_attempts')->default(false);
            $table->json('qualification_rules_json')->nullable();
            $table->json('reward_configuration_json')->nullable();
            $table->string('visibility', 16)->default('public');
            $table->boolean('featured')->default(false);
            $table->timestamps();
            $table->index(['status', 'starts_at']);
            $table->index(['season_id', 'status']);
        });

        Schema::create('tournament_registrations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tournament_id')->constrained('tournaments')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('registered_at');
            $table->timestamps();
            $table->unique(['tournament_id', 'user_id']);
        });

        Schema::create('tournament_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tournament_id')->constrained('tournaments')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('race_run_id')->nullable()->constrained('race_runs')->nullOnDelete();
            $table->string('submission_id');
            $table->uuid('race_session_id')->nullable();
            $table->string('status', 24)->default('pending');
            $table->boolean('is_practice')->default(false);
            $table->unsignedInteger('duration_ms')->nullable();
            $table->unsignedInteger('crash_count')->default(0);
            $table->unsignedInteger('rank')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();
            $table->unique(['tournament_id', 'submission_id']);
            $table->index(['tournament_id', 'user_id', 'is_practice', 'status']);
            $table->index(['tournament_id', 'status', 'duration_ms']);
        });

        Schema::create('ghost_events', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->foreignId('season_id')->nullable()->constrained('seasons')->nullOnDelete();
            $table->foreignId('tournament_id')->nullable()->constrained('tournaments')->nullOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('environment_id');
            $table->string('course_id');
            $table->unsignedInteger('course_version')->default(1);
            $table->string('weather_preset_id');
            $table->unsignedBigInteger('weather_seed')->nullable();
            $table->string('physics_version')->default('1.0.0');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->string('benchmark_type', 32)->default('curated');
            $table->string('scoring_type', 32)->default('fastest_time');
            $table->unsignedInteger('max_attempts')->nullable();
            $table->unsignedTinyInteger('max_visible_ghosts')->default(2);
            $table->json('reward_configuration_json')->nullable();
            $table->boolean('enabled')->default(true);
            $table->timestamps();
            $table->index(['enabled', 'starts_at', 'ends_at']);
        });

        Schema::create('ghost_event_benchmarks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ghost_event_id')->constrained('ghost_events')->cascadeOnDelete();
            $table->string('slot', 32)->default('benchmark');
            $table->foreignId('replay_record_id')->nullable()->constrained('replay_records')->nullOnDelete();
            $table->foreignId('race_run_id')->nullable()->constrained('race_runs')->nullOnDelete();
            $table->string('label')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->string('digest', 128)->nullable();
            $table->string('compatibility_version', 32)->default('1');
            $table->json('metadata_json')->nullable();
            $table->timestamps();
            $table->unique(['ghost_event_id', 'slot']);
        });

        Schema::create('ghost_event_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ghost_event_id')->constrained('ghost_events')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('race_run_id')->nullable()->constrained('race_runs')->nullOnDelete();
            $table->string('submission_id');
            $table->uuid('race_session_id')->nullable();
            $table->string('status', 24)->default('pending');
            $table->boolean('is_practice')->default(false);
            $table->unsignedInteger('duration_ms')->nullable();
            $table->boolean('benchmark_beaten')->default(false);
            $table->integer('delta_ms')->nullable();
            $table->unsignedInteger('rank')->nullable();
            $table->unsignedInteger('season_points_awarded')->default(0);
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();
            $table->unique(['ghost_event_id', 'submission_id']);
            $table->index(['ghost_event_id', 'user_id', 'is_practice', 'status']);
            $table->index(['ghost_event_id', 'status', 'duration_ms']);
        });

        Schema::create('user_entitlements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('entitlement_type', 64);
            $table->string('entitlement_key', 128);
            $table->string('source_type', 64);
            $table->string('source_id', 64);
            $table->timestamp('granted_at');
            $table->timestamp('revoked_at')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'entitlement_type', 'entitlement_key'], 'user_entitlement_unique');
            $table->index(['user_id', 'revoked_at']);
            $table->unique(['user_id', 'source_type', 'source_id', 'entitlement_key'], 'user_entitlement_source_unique');
        });

        Schema::create('cosmetic_definitions', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('category', 32);
            $table->string('name');
            $table->text('description')->nullable();
            $table->json('preview_json')->nullable();
            $table->json('material_preset_json')->nullable();
            $table->boolean('default_owned')->default(false);
            $table->boolean('enabled')->default(true);
            $table->timestamps();
            $table->index(['category', 'enabled']);
        });

        Schema::create('user_loadouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('category', 32);
            $table->string('cosmetic_key');
            $table->timestamps();
            $table->unique(['user_id', 'category']);
        });

        Schema::create('user_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 64);
            $table->string('title');
            $table->text('body');
            $table->string('action_url')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['user_id', 'read_at', 'created_at']);
            $table->index('expires_at');
        });

        Schema::create('notification_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete()->unique();
            $table->boolean('email_security')->default(true);
            $table->boolean('email_tournament_reminder')->default(false);
            $table->boolean('email_season_ending')->default(false);
            $table->boolean('email_weekly_summary')->default(false);
            $table->boolean('email_engagement_opt_in')->default(false);
            $table->string('unsubscribe_token', 64)->unique();
            $table->timestamps();
        });

        Schema::create('participation_streaks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete()->unique();
            $table->unsignedInteger('current_streak')->default(0);
            $table->unsignedInteger('longest_streak')->default(0);
            $table->date('last_qualifying_date')->nullable();
            $table->unsignedInteger('active_competitive_days')->default(0);
            $table->unsignedInteger('daily_challenge_days')->default(0);
            $table->timestamps();
        });

        Schema::create('beta_invites', function (Blueprint $table) {
            $table->id();
            $table->string('code', 64)->unique();
            $table->unsignedInteger('usage_limit')->default(1);
            $table->unsignedInteger('usage_count')->default(0);
            $table->timestamp('expires_at')->nullable();
            $table->string('email_binding')->nullable();
            $table->string('campaign')->nullable();
            $table->string('source')->nullable();
            $table->boolean('enabled')->default(true);
            $table->json('metadata_json')->nullable();
            $table->timestamps();
            $table->index(['enabled', 'expires_at']);
        });

        Schema::create('feature_flags', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->boolean('enabled')->default(false);
            $table->string('targeting', 32)->default('global');
            $table->json('targeting_config_json')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('integrity_audit_runs', function (Blueprint $table) {
            $table->id();
            $table->string('audit_type', 64);
            $table->boolean('dry_run')->default(true);
            $table->string('status', 24)->default('running');
            $table->unsignedInteger('findings_count')->default(0);
            $table->unsignedInteger('repairs_count')->default(0);
            $table->json('summary_json')->nullable();
            $table->foreignId('started_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('started_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->index(['audit_type', 'started_at']);
        });

        Schema::create('integrity_audit_findings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('integrity_audit_run_id')->constrained('integrity_audit_runs')->cascadeOnDelete();
            $table->string('severity', 64);
            $table->string('subject_type', 64)->nullable();
            $table->string('subject_id', 64)->nullable();
            $table->json('details_json')->nullable();
            $table->boolean('repaired')->default(false);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['integrity_audit_run_id', 'severity']);
        });

        Schema::create('operational_metrics', function (Blueprint $table) {
            $table->id();
            $table->string('metric_key', 128);
            $table->string('period', 32)->default('all');
            $table->unsignedBigInteger('value')->default(0);
            $table->json('metadata_json')->nullable();
            $table->timestamp('updated_at')->useCurrent();
            $table->unique(['metric_key', 'period']);
        });

        Schema::create('review_queue_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('race_run_id')->constrained('race_runs')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('reason', 64);
            $table->unsignedInteger('priority')->default(0);
            $table->unsignedInteger('anomaly_score')->default(0);
            $table->boolean('leaderboard_impact')->default(false);
            $table->boolean('tournament_impact')->default(false);
            $table->boolean('season_impact')->default(false);
            $table->string('status', 24)->default('open');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('review_reason')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();
            $table->unique('race_run_id');
            $table->index(['status', 'priority']);
        });

        Schema::create('lifecycle_reward_grants', function (Blueprint $table) {
            $table->id();
            $table->string('source_type', 64);
            $table->string('source_id', 64);
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('reward_key', 128);
            $table->timestamp('granted_at');
            $table->json('metadata_json')->nullable();
            $table->unique(['source_type', 'source_id', 'user_id', 'reward_key'], 'lifecycle_reward_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lifecycle_reward_grants');
        Schema::dropIfExists('review_queue_items');
        Schema::dropIfExists('operational_metrics');
        Schema::dropIfExists('integrity_audit_findings');
        Schema::dropIfExists('integrity_audit_runs');
        Schema::dropIfExists('feature_flags');
        Schema::dropIfExists('beta_invites');
        Schema::dropIfExists('participation_streaks');
        Schema::dropIfExists('notification_preferences');
        Schema::dropIfExists('user_notifications');
        Schema::dropIfExists('user_loadouts');
        Schema::dropIfExists('cosmetic_definitions');
        Schema::dropIfExists('user_entitlements');
        Schema::dropIfExists('ghost_event_attempts');
        Schema::dropIfExists('ghost_event_benchmarks');
        Schema::dropIfExists('ghost_events');
        Schema::dropIfExists('tournament_attempts');
        Schema::dropIfExists('tournament_registrations');
        Schema::dropIfExists('tournaments');
        Schema::dropIfExists('season_mission_progress');
        Schema::dropIfExists('season_missions');
        Schema::dropIfExists('season_rating_transactions');
        Schema::dropIfExists('season_participants');
        Schema::dropIfExists('season_divisions');
        Schema::dropIfExists('seasons');

        Schema::table('replay_records', function (Blueprint $table) {
            $table->dropColumn(['retention_category', 'benchmark_eligible', 'integrity_ok', 'integrity_checked_at']);
        });

        Schema::table('race_runs', function (Blueprint $table) {
            $table->dropIndex(['context_type', 'context_id', 'status']);
            $table->dropColumn(['context_type', 'context_id']);
        });

        Schema::table('race_sessions', function (Blueprint $table) {
            $table->dropIndex(['context_type', 'context_id']);
            $table->dropColumn(['context_type', 'context_id', 'mode', 'context_metadata']);
        });
    }
};
