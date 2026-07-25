<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_pilot_can_register(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'displayName' => 'New Pilot',
            'username' => 'new_pilot',
            'email' => 'new_pilot@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'countryCode' => 'US',
            'acceptedTerms' => true,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('user.username', 'new_pilot');
        $this->assertNotEmpty($response->json('token'));

        $this->assertDatabaseHas('users', ['username' => 'new_pilot', 'email' => 'new_pilot@example.com']);
        $this->assertDatabaseHas('pilot_profiles', ['user_id' => User::where('username', 'new_pilot')->first()->id]);
    }

    public function test_registration_rejects_uppercase_or_reserved_usernames(): void
    {
        $this->postJson('/api/v1/auth/register', $this->registrationPayload(['username' => 'Invalid_Name']))
            ->assertStatus(422);

        $this->postJson('/api/v1/auth/register', $this->registrationPayload(['username' => 'admin']))
            ->assertStatus(422);
    }

    public function test_registration_requires_accepted_terms(): void
    {
        $this->postJson('/api/v1/auth/register', $this->registrationPayload(['acceptedTerms' => false]))
            ->assertStatus(422);
    }

    public function test_a_pilot_can_login_with_username_or_email(): void
    {
        $user = User::factory()->create(['username' => 'login_pilot', 'email' => 'login_pilot@example.com']);

        $this->postJson('/api/v1/auth/login', ['identifier' => 'login_pilot', 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('user.id', $user->id);

        $this->postJson('/api/v1/auth/login', ['identifier' => 'login_pilot@example.com', 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_login_with_invalid_credentials_returns_generic_error(): void
    {
        User::factory()->create(['username' => 'someone', 'email' => 'someone@example.com']);

        $response = $this->postJson('/api/v1/auth/login', ['identifier' => 'someone', 'password' => 'wrong-password']);
        $response->assertStatus(401);
        $response->assertJsonPath('error.code', 'invalid_credentials');

        // Unknown identifier gets the exact same error code/shape (no enumeration).
        $missing = $this->postJson('/api/v1/auth/login', ['identifier' => 'does-not-exist', 'password' => 'wrong-password']);
        $missing->assertStatus(401);
        $missing->assertJsonPath('error.code', 'invalid_credentials');
    }

    public function test_a_banned_pilot_cannot_login(): void
    {
        User::factory()->banned()->create(['username' => 'banned_pilot', 'email' => 'banned_pilot@example.com']);

        $response = $this->postJson('/api/v1/auth/login', ['identifier' => 'banned_pilot', 'password' => 'password']);

        $response->assertStatus(403);
        $response->assertJsonPath('error.code', 'account_suspended');
    }

    public function test_authenticated_user_can_fetch_me(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_logout_revokes_the_current_access_token(): void
    {
        $user = User::factory()->create();
        $newToken = $user->createToken('test');

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $newToken->accessToken->id]);

        $this->withToken($newToken->plainTextToken)->postJson('/api/v1/auth/logout')->assertOk();

        // The Laravel test client caches the resolved Sanctum guard's user
        // for the remainder of the test, so we assert revocation directly
        // against the database rather than re-issuing an authenticated
        // request with the now-revoked token.
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $newToken->accessToken->id]);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/v1/auth/me')->assertStatus(401);
    }

    public function test_forgot_password_returns_generic_success_regardless_of_email_existing(): void
    {
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'nobody@example.com'])
            ->assertOk()
            ->assertJsonStructure(['message']);
    }

    private function registrationPayload(array $overrides = []): array
    {
        return array_merge([
            'displayName' => 'New Pilot',
            'username' => 'valid_username',
            'email' => 'valid_username@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'countryCode' => 'US',
            'acceptedTerms' => true,
        ], $overrides);
    }
}
