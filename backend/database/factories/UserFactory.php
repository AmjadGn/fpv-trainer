<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $username = strtolower(fake()->unique()->userName());
        $username = preg_replace('/[^a-z0-9_]/', '', $username);
        $username = substr($username !== '' ? $username : 'pilot'.fake()->unique()->numberBetween(1, 999999), 0, 24);

        return [
            'name' => fake()->name(),
            'username' => $username,
            'display_name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
            'country_code' => fake()->countryCode(),
            'competitive_status' => User::STATUS_ACTIVE,
            'accepted_terms_at' => now(),
            'is_admin' => false,
        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    public function admin(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_admin' => true,
        ]);
    }

    public function suspended(): static
    {
        return $this->state(fn (array $attributes) => [
            'competitive_status' => User::STATUS_RESTRICTED,
            'suspended_at' => now(),
        ]);
    }

    public function banned(): static
    {
        return $this->state(fn (array $attributes) => [
            'competitive_status' => User::STATUS_BANNED,
            'suspended_at' => now(),
        ]);
    }
}
