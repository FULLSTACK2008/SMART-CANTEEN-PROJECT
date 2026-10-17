<?php

namespace Tests\Feature;

use App\Models\Student;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class DailyReportApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['super-admin', 'patron', 'matron', 'canteen-server'] as $role) {
            Role::firstOrCreate(['name' => $role, 'guard_name' => 'web']);
        }
    }

    public function test_canteen_server_daily_report_groups_buyers_and_purchase_totals_by_gender(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');
        $boy = $this->createStudent('REP-B1', 'Buyer Boy', 'male');
        $girl = $this->createStudent('REP-G1', 'Buyer Girl', 'female');

        $this->createPurchase($boy, 'report-boy-sale-1', 100);
        $this->createPurchase($boy, 'report-boy-sale-2', 50);
        $boy->update(['balance' => 850]);
        $this->createPurchase($girl, 'report-girl-sale', 75);

        $this->actingAs($server, 'web')->getJson('/api/reports/daily')
            ->assertOk()
            ->assertJsonPath('groups.0.gender', 'male')
            ->assertJsonPath('groups.0.student_count', 1)
            ->assertJsonPath('groups.0.purchase_count', 2)
            ->assertJsonPath('groups.0.total_spent', 150)
            ->assertJsonPath('groups.0.students.0.full_name', 'Buyer Boy')
            ->assertJsonPath('groups.0.students.0.balance', 850)
            ->assertJsonPath('groups.1.gender', 'female')
            ->assertJsonPath('groups.1.total_spent', 75)
            ->assertJsonPath('total_students', 2)
            ->assertJsonPath('total_spent', 225);
    }

    public function test_patron_report_contains_only_owned_boys(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $otherPatron = User::factory()->create(['status' => 'active']);
        $otherPatron->assignRole('patron');
        $ownedBoy = $this->createStudent('REP-B2', 'Owned Boy', 'male', $patron->id);
        $otherBoy = $this->createStudent('REP-B3', 'Other Boy', 'male', $otherPatron->id);
        $girl = $this->createStudent('REP-G2', 'Girl', 'female', $patron->id);

        $this->createPurchase($ownedBoy, 'report-owned-sale', 60);
        $this->createPurchase($otherBoy, 'report-other-sale', 90);
        $this->createPurchase($girl, 'report-girl-sale-2', 40);

        $this->actingAs($patron, 'web')->getJson('/api/reports/daily')
            ->assertOk()
            ->assertJsonCount(1, 'groups')
            ->assertJsonPath('groups.0.gender', 'male')
            ->assertJsonPath('groups.0.students.0.full_name', 'Owned Boy')
            ->assertJsonPath('groups.0.total_spent', 60);
    }

    private function createStudent(string $number, string $name, string $gender, ?int $ownerId = null): Student
    {
        return Student::create([
            'student_number' => $number,
            'full_name' => $name,
            'gender' => $gender,
            'balance' => 1000,
            'managed_by' => $ownerId,
            'created_by' => $ownerId,
        ]);
    }

    private function createPurchase(Student $student, string $uuid, float $amount): void
    {
        Transaction::create([
            'uuid' => $uuid,
            'student_id' => $student->id,
            'type' => 'purchase',
            'amount' => $amount,
            'balance_before' => 1000,
            'balance_after' => 1000 - $amount,
            'status' => 'completed',
            'client_created_at' => now(),
        ]);
    }
}