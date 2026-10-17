<?php

namespace Tests\Feature;

use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class StudentApiTest extends TestCase
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

    public function test_patron_can_list_only_boys(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');

        Student::create([
            'student_number' => 'B-1001',
            'full_name' => 'Male Student One',
            'gender' => 'male',
            'balance' => 1000,
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);

        Student::create([
            'student_number' => 'G-1001',
            'full_name' => 'Female Student One',
            'gender' => 'female',
            'balance' => 1000,
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);

        $response = $this->actingAs($patron, 'web')->getJson('/api/students');

        $response->assertStatus(200)
            ->assertJsonPath('data.0.gender', 'male')
            ->assertJsonCount(1, 'data');
    }

    public function test_student_directory_can_be_paginated_without_exposing_other_managers_records(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $otherPatron = User::factory()->create(['status' => 'active']);
        $otherPatron->assignRole('patron');

        foreach (range(1, 3) as $number) {
            Student::create([
                'student_number' => "PAGE-{$number}",
                'full_name' => "Paged Student {$number}",
                'gender' => 'male',
                'managed_by' => $patron->id,
                'created_by' => $patron->id,
            ]);
        }

        Student::create([
            'student_number' => 'PAGE-OTHER',
            'full_name' => 'Other Manager Student',
            'gender' => 'male',
            'managed_by' => $otherPatron->id,
            'created_by' => $otherPatron->id,
        ]);

        $this->actingAs($patron, 'web')->getJson('/api/students?per_page=2&page=1')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.total', 3);

        $this->getJson('/api/students?per_page=2&page=2')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonMissing(['full_name' => 'Other Manager Student']);
    }

    public function test_patron_cannot_access_female_student_profile(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');

        $girl = Student::create([
            'student_number' => 'G-2001',
            'full_name' => 'Girl Student',
            'gender' => 'female',
            'balance' => 2000,
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);

        $response = $this->actingAs($patron, 'web')->getJson('/api/students/'.$girl->id);

        $response->assertStatus(403);
    }

    public function test_patron_list_and_search_only_return_owned_students(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $otherPatron = User::factory()->create(['status' => 'active']);
        $otherPatron->assignRole('patron');

        Student::create([
            'student_number' => 'B-3001',
            'full_name' => 'Managed Boy',
            'gender' => 'male',
            'balance' => 100,
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);

        Student::create([
            'student_number' => 'B-3002',
            'full_name' => 'Other Boy',
            'gender' => 'male',
            'balance' => 100,
            'managed_by' => $otherPatron->id,
            'created_by' => $otherPatron->id,
        ]);

        $this->actingAs($patron, 'web')->getJson('/api/students')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.full_name', 'Managed Boy');

        $this->getJson('/api/students/search?q=Other')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_student_endpoints_cannot_set_or_change_wallet_balance(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $student = Student::create([
            'student_number' => 'B-4001',
            'full_name' => 'Wallet Protected Student',
            'gender' => 'male',
            'balance' => 3000,
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);

        $this->actingAs($patron, 'web')->putJson('/api/students/'.$student->id, [
            'balance' => 4000,
        ])->assertUnprocessable();

        $this->postJson('/api/students', [
            'student_number' => 'B-4002',
            'full_name' => 'New Student',
            'gender' => 'male',
            'balance' => 1000,
        ])->assertUnprocessable();

        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '3000.00']);
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_patron_can_archive_restore_and_permanently_delete_only_owned_students(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $otherPatron = User::factory()->create(['status' => 'active']);
        $otherPatron->assignRole('patron');

        $student = Student::create([
            'student_number' => 'B-RECYCLE-1',
            'full_name' => 'Recycle Student',
            'gender' => 'male',
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);
        $otherStudent = Student::create([
            'student_number' => 'B-RECYCLE-2',
            'full_name' => 'Other Patron Student',
            'gender' => 'male',
            'managed_by' => $otherPatron->id,
            'created_by' => $otherPatron->id,
        ]);

        $this->actingAs($patron, 'web')->deleteJson('/api/students/'.$student->id)
            ->assertOk();

        $this->getJson('/api/students/recycle')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $student->id)
            ->assertJsonPath('data.0.deleted_at', fn ($value) => is_string($value));

        $this->patchJson('/api/students/'.$otherStudent->id.'/restore')->assertForbidden();
        $this->patchJson('/api/students/'.$student->id.'/restore')->assertOk();
        $this->assertDatabaseHas('students', ['id' => $student->id, 'deleted_at' => null]);

        $this->deleteJson('/api/students/'.$student->id)->assertOk();
        $this->deleteJson('/api/students/'.$student->id.'/permanent')->assertOk();
        $this->assertDatabaseMissing('students', ['id' => $student->id]);
    }

    public function test_delete_all_archives_only_students_assigned_to_the_signed_in_manager(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $otherPatron = User::factory()->create(['status' => 'active']);
        $otherPatron->assignRole('patron');
        $owned = Student::create([
            'student_number' => 'B-DELETE-ALL-1',
            'full_name' => 'Owned Student',
            'gender' => 'male',
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);
        $notOwned = Student::create([
            'student_number' => 'B-DELETE-ALL-2',
            'full_name' => 'Unowned Student',
            'gender' => 'male',
            'managed_by' => $otherPatron->id,
            'created_by' => $otherPatron->id,
        ]);

        $this->actingAs($patron, 'web')->deleteJson('/api/students/bulk')
            ->assertOk()
            ->assertJsonPath('deleted_count', 1);

        $this->assertSoftDeleted('students', ['id' => $owned->id]);
        $this->assertDatabaseHas('students', ['id' => $notOwned->id, 'deleted_at' => null]);
    }

    public function test_admin_can_view_a_managers_deleted_students(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->assignRole('super-admin');
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $student = Student::create([
            'student_number' => 'B-ADMIN-RECYCLE',
            'full_name' => 'Archived Student',
            'gender' => 'male',
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);
        $student->delete();

        $this->actingAs($admin, 'web')->getJson('/api/admin/users/'.$patron->id.'/students')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.full_name', 'Archived Student')
            ->assertJsonPath('data.0.deleted_at', fn ($value) => is_string($value));

        $this->getJson('/api/admin/users/'.$admin->id.'/students')->assertNotFound();
    }

    public function test_patron_can_upload_a_student_photo_and_search_returns_its_url(): void
    {
        Storage::fake('public');
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $student = Student::create([
            'student_number' => 'B-PHOTO-1',
            'full_name' => 'Photo Student',
            'gender' => 'male',
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);

        $response = $this->actingAs($patron, 'web')->postJson(
            '/api/students/'.$student->id.'/photo',
            ['photo' => UploadedFile::fake()->createWithContent(
                'student.png',
                base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS8cAAAAASUVORK5CYII='),
            )],
        );

        $response->assertOk()
            ->assertJsonPath('data.full_name', 'Photo Student')
            ->assertJsonPath('data.photo_path', fn ($path) => is_string($path))
            ->assertJsonPath('data.photo_url', fn ($url) => str_contains($url, '/storage/students/'));

        Storage::disk('public')->assertExists($student->fresh()->photo_path);
        $this->assertSame(
            Storage::disk('public')->url($student->fresh()->photo_path),
            $response->json('data.photo_url'),
        );

        $this->getJson('/api/students?search=Photo')
            ->assertOk()
            ->assertJsonPath('data.0.full_name', 'Photo Student')
            ->assertJsonPath('data.0.photo_url', $response->json('data.photo_url'));
    }
}
