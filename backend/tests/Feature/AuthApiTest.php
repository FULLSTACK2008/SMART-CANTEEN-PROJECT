<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Student;
use App\Models\Transaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['name' => 'super-admin', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'patron', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'matron', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'canteen-server', 'guard_name' => 'web']);
    }

    public function test_registration_stays_pending_without_a_role(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'New Patron',
            'email' => 'patron@example.com',
            'username' => 'new_patron',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.roles', []);

        $this->assertDatabaseHas('users', [
            'email' => 'patron@example.com',
            'status' => 'pending',
        ]);
        $this->assertDatabaseMissing('model_has_roles', [
            'model_id' => $response->json('data.id'),
            'model_type' => User::class,
        ]);
    }

    public function test_registration_rejects_client_supplied_roles(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'Untrusted Admin',
            'email' => 'untrusted@example.com',
            'username' => 'untrusted_admin',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
            'role' => 'super-admin',
        ])->assertUnprocessable()->assertJsonValidationErrors('role');

        $this->assertDatabaseMissing('users', ['email' => 'untrusted@example.com']);
    }

    public function test_admin_can_assign_a_staff_role_to_a_registered_user(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->assignRole('super-admin');
        $registeredUser = User::factory()->create(['status' => 'pending']);

        $this->actingAs($admin, 'web')
            ->patchJson('/api/admin/users/'.$registeredUser->id.'/role', [
                'role' => 'canteen-server',
            ])
            ->assertOk()
            ->assertJsonPath('data.roles.0', 'canteen-server');

        $registeredUser->refresh();
        $this->assertTrue($registeredUser->hasRole('canteen-server'));

        $this->patchJson('/api/admin/users/'.$registeredUser->id.'/role', [
            'role' => 'patron',
        ])->assertOk()->assertJsonPath('data.roles.0', 'patron');

        $registeredUser->refresh();
        $this->assertTrue($registeredUser->hasRole('patron'));
        $this->assertFalse($registeredUser->hasRole('canteen-server'));
    }

    public function test_non_admin_cannot_assign_staff_roles(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $registeredUser = User::factory()->create(['status' => 'pending']);

        $this->actingAs($patron, 'web')
            ->patchJson('/api/admin/users/'.$registeredUser->id.'/role', [
                'role' => 'canteen-server',
            ])
            ->assertForbidden();

        $this->assertFalse($registeredUser->fresh()->hasAnyRole(['patron', 'matron', 'canteen-server']));
    }

    public function test_admin_cannot_assign_an_administrator_role_through_staff_role_management(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->assignRole('super-admin');
        $registeredUser = User::factory()->create(['status' => 'pending']);

        $this->actingAs($admin, 'web')
            ->patchJson('/api/admin/users/'.$registeredUser->id.'/role', [
                'role' => 'super-admin',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');

        $this->assertFalse($registeredUser->fresh()->hasRole('super-admin'));

        $this->patchJson('/api/admin/users/'.$admin->id.'/role', [
            'role' => 'patron',
        ])->assertUnprocessable();

        $this->assertTrue($admin->fresh()->hasRole('super-admin'));
    }

    public function test_admin_can_replace_a_legacy_pending_administrator_role_claim(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->assignRole('super-admin');
        $registeredUser = User::factory()->create(['status' => 'pending']);
        $registeredUser->assignRole('super-admin');

        $this->actingAs($admin, 'web')
            ->patchJson('/api/admin/users/'.$registeredUser->id.'/role', [
                'role' => 'patron',
            ])
            ->assertOk()
            ->assertJsonPath('data.roles.0', 'patron');

        $registeredUser->refresh();
        $this->assertFalse($registeredUser->hasRole('super-admin'));
        $this->assertTrue($registeredUser->hasRole('patron'));
    }

    public function test_admin_cannot_approve_an_account_until_it_has_a_staff_role(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->assignRole('super-admin');
        $registeredUser = User::factory()->create(['status' => 'pending']);

        $this->actingAs($admin, 'web')
            ->postJson('/api/admin/users/'.$registeredUser->id.'/approve')
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Assign a staff role before approving this account.');

        $this->assertDatabaseHas('users', [
            'id' => $registeredUser->id,
            'status' => 'pending',
        ]);
    }

    public function test_admin_cannot_approve_a_pending_super_admin_role_claim(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->assignRole('super-admin');
        $registeredUser = User::factory()->create(['status' => 'pending']);
        $registeredUser->assignRole('super-admin');

        $this->actingAs($admin, 'web')
            ->postJson('/api/admin/users/'.$registeredUser->id.'/approve')
            ->assertUnprocessable();

        $this->assertDatabaseHas('users', [
            'id' => $registeredUser->id,
            'status' => 'pending',
        ]);
    }

    public function test_pending_user_cannot_login(): void
    {
        $user = User::factory()->create([
            'email' => 'pending@example.com',
            'username' => 'pending_user',
            'password' => bcrypt('Password123!'),
            'status' => 'pending',
        ]);

        $user->assignRole('canteen-server');

        $response = $this->postJson('/api/auth/login', [
            'email' => 'pending@example.com',
            'password' => 'Password123!',
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('message', 'Your account is pending approval.');
    }

    public function test_user_can_save_and_fetch_language_and_theme_preferences(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $user->assignRole('patron');

        $this->actingAs($user, 'web')->patchJson('/api/auth/preferences', [
            'locale' => 'rw',
            'theme' => 'dark',
        ])->assertOk()
            ->assertJsonPath('data.locale', 'rw')
            ->assertJsonPath('data.theme', 'dark');

        $this->getJson('/api/auth/me')->assertOk()
            ->assertJsonPath('data.locale', 'rw')
            ->assertJsonPath('data.theme', 'dark');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'locale' => 'rw',
            'theme' => 'dark',
        ]);
    }

    public function test_user_can_save_french_language_preference(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $user->assignRole('patron');

        $this->actingAs($user, 'web')->patchJson('/api/auth/preferences', [
            'locale' => 'fr',
        ])->assertOk()
            ->assertJsonPath('data.locale', 'fr');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'locale' => 'fr',
        ]);
    }

    public function test_admin_user_can_fetch_pending_staff_list(): void
    {
        $admin = User::factory()->create([
            'email' => 'admin@test.com',
            'username' => 'admin_staff',
            'password' => bcrypt('Password123!'),
            'status' => 'active',
        ]);
        $admin->assignRole('super-admin');

        $pending = User::factory()->create([
            'email' => 'pending_staff@test.com',
            'username' => 'pending_staff',
            'password' => bcrypt('Password123!'),
            'status' => 'pending',
        ]);

        $pending->assignRole('patron');

        $response = $this->actingAs($admin, 'web')->getJson('/api/admin/users');

        $response->assertStatus(200)
            ->assertJsonPath('data.0.email', 'pending_staff@test.com');
    }

    public function test_admin_dashboard_returns_real_metrics_and_recent_activity(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->assignRole('super-admin');
        $pending = User::factory()->create(['status' => 'pending']);
        $pending->assignRole('patron');
        $student = Student::create([
            'student_number' => 'ADM-1001',
            'full_name' => 'Dashboard Student',
            'gender' => 'male',
            'balance' => 500,
            'managed_by' => $admin->id,
            'created_by' => $admin->id,
        ]);
        Transaction::create([
            'uuid' => 'admin-dashboard-sale',
            'student_id' => $student->id,
            'type' => 'purchase',
            'amount' => 150,
            'balance_before' => 650,
            'balance_after' => 500,
            'processed_by' => $admin->id,
            'status' => 'completed',
            'client_created_at' => now(),
        ]);

        $this->actingAs($admin, 'web')->getJson('/api/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('metrics.users_pending', 1)
            ->assertJsonPath('metrics.students_total', 1)
            ->assertJsonPath('metrics.transactions_today', 1)
            ->assertJsonPath('metrics.sales_today', 150)
            ->assertJsonPath('pending_users.0.id', $pending->id)
            ->assertJsonPath('recent_transactions.0.student.full_name', 'Dashboard Student');
    }

    public function test_non_admin_cannot_access_admin_dashboard(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');

        $this->actingAs($patron, 'web')->getJson('/api/admin/dashboard')->assertForbidden();
    }

    public function test_admin_cannot_suspend_themselves_or_the_last_active_admin(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->assignRole('super-admin');

        $this->actingAs($admin, 'web')->postJson('/api/admin/users/'.$admin->id.'/suspend')
            ->assertUnprocessable();

        $this->assertDatabaseHas('users', ['id' => $admin->id, 'status' => 'active']);

        $otherAdmin = User::factory()->create(['status' => 'active']);
        $otherAdmin->assignRole('super-admin');

        $this->postJson('/api/admin/users/'.$otherAdmin->id.'/suspend')->assertOk();
        $this->assertDatabaseHas('users', ['id' => $admin->id, 'status' => 'active']);
        $this->assertDatabaseHas('users', ['id' => $otherAdmin->id, 'status' => 'suspended']);
    }
}
