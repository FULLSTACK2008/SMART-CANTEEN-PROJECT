<?php

namespace Tests\Feature;

use App\Models\Student;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class TransactionApiTest extends TestCase
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

    public function test_default_seed_data_does_not_preload_students_balances_or_foods(): void
    {
        $this->seed();

        $this->assertDatabaseCount('students', 0);
        $this->assertDatabaseCount('transactions', 0);
        $this->assertDatabaseCount('menu_items', 0);
    }

    public function test_transaction_history_can_be_paginated(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->assignRole('super-admin');
        $student = Student::create([
            'student_number' => 'PAGE-TRANSACTION',
            'full_name' => 'History Student',
            'gender' => 'male',
        ]);

        foreach (range(1, 3) as $number) {
            Transaction::create([
                'uuid' => "history-page-{$number}",
                'student_id' => $student->id,
                'type' => 'deposit',
                'amount' => 100,
                'balance_before' => ($number - 1) * 100,
                'balance_after' => $number * 100,
                'status' => 'completed',
            ]);
        }

        $this->actingAs($admin, 'web')
            ->getJson('/api/transactions/history?student_id='.$student->id.'&per_page=2&page=1')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.total', 3);
    }

    public function test_purchase_success_updates_balance_and_records_ledger(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');

        $student = Student::create([
            'student_number' => 'B-9001',
            'full_name' => 'Cash Buyer',
            'gender' => 'male',
            'balance' => 250.00,
        ]);

        $response = $this->actingAs($server, 'web')->postJson('/api/transactions/purchase', [
            'student_id' => $student->id,
            'uuid' => 'purchase-1',
            'note' => 'Lunch',
            'amount' => 75,
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.type', 'purchase')
            ->assertJsonPath('data.amount', 75)
            ->assertJsonPath('data.balance_before', 250)
            ->assertJsonPath('data.balance_after', 175);

        $this->assertDatabaseHas('transactions', ['uuid' => 'purchase-1', 'type' => 'purchase']);
        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '175.00']);
    }

    public function test_purchase_rejects_insufficient_balance(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');

        $student = Student::create([
            'student_number' => 'B-9002',
            'full_name' => 'Low Balance',
            'gender' => 'male',
            'balance' => 40.00,
        ]);

        $response = $this->actingAs($server, 'web')->postJson('/api/transactions/purchase', [
            'student_id' => $student->id,
            'uuid' => 'purchase-2',
            'amount' => 60,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'INSUFFICIENT BALANCE');
    }

    public function test_bulk_purchase_updates_each_wallet_and_records_each_sale(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');
        $firstStudent = Student::create([
            'student_number' => 'B-9101',
            'full_name' => 'First Batch Student',
            'gender' => 'male',
            'balance' => 250.00,
        ]);
        $secondStudent = Student::create([
            'student_number' => 'B-9102',
            'full_name' => 'Second Batch Student',
            'gender' => 'female',
            'balance' => 180.00,
        ]);

        $payload = [
            'sales' => [
                ['student_id' => $firstStudent->id, 'amount' => 75, 'uuid' => 'bulk-purchase-1'],
                ['student_id' => $secondStudent->id, 'amount' => 60, 'uuid' => 'bulk-purchase-2'],
            ],
        ];

        $this->actingAs($server, 'web')->postJson('/api/transactions/purchase/bulk', $payload)
            ->assertCreated()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.type', 'purchase');

        $this->postJson('/api/transactions/purchase/bulk', $payload)
            ->assertCreated()
            ->assertJsonCount(2, 'data');

        $this->assertDatabaseCount('transactions', 2);
        $this->assertDatabaseHas('students', ['id' => $firstStudent->id, 'balance' => '175.00']);
        $this->assertDatabaseHas('students', ['id' => $secondStudent->id, 'balance' => '120.00']);
    }

    public function test_bulk_purchase_rolls_back_every_sale_if_any_charge_fails(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');
        $firstStudent = Student::create([
            'student_number' => 'B-9201',
            'full_name' => 'Affordable Student',
            'gender' => 'male',
            'balance' => 250.00,
        ]);
        $secondStudent = Student::create([
            'student_number' => 'B-9202',
            'full_name' => 'Insufficient Student',
            'gender' => 'female',
            'balance' => 20.00,
        ]);

        $this->actingAs($server, 'web')->postJson('/api/transactions/purchase/bulk', [
            'sales' => [
                ['student_id' => $firstStudent->id, 'amount' => 75, 'uuid' => 'bulk-rollback-1'],
                ['student_id' => $secondStudent->id, 'amount' => 60, 'uuid' => 'bulk-rollback-2'],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('sales.1.amount');

        $this->assertDatabaseCount('transactions', 0);
        $this->assertDatabaseHas('students', ['id' => $firstStudent->id, 'balance' => '250.00']);
        $this->assertDatabaseHas('students', ['id' => $secondStudent->id, 'balance' => '20.00']);
    }

    public function test_refund_creates_credit_and_is_idempotent_by_uuid(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');

        $student = Student::create([
            'student_number' => 'B-9003',
            'full_name' => 'Refundable',
            'gender' => 'male',
            'balance' => 100.00,
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);

        $first = $this->actingAs($patron, 'web')->postJson('/api/transactions/refund', [
            'student_id' => $student->id,
            'amount' => 20.00,
            'uuid' => 'refund-1',
            'reason' => 'Overcharge',
        ]);

        $first->assertStatus(201);

        $second = $this->actingAs($patron, 'web')->postJson('/api/transactions/refund', [
            'student_id' => $student->id,
            'amount' => 20.00,
            'uuid' => 'refund-1',
            'reason' => 'Overcharge',
        ]);

        $second->assertStatus(200)
            ->assertJsonPath('message', 'Refund already processed.');

        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '120.00']);
    }

    public function test_deposit_creates_a_private_notification_and_inbox_can_mark_it_read(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');

        $student = Student::create([
            'student_number' => 'B-9004',
            'full_name' => 'Notification Recipient',
            'gender' => 'male',
            'balance' => 3000.00,
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);

        $response = $this->actingAs($patron, 'web')->postJson('/api/transactions/deposit', [
            'student_id' => $student->id,
            'amount' => 1000,
            'uuid' => 'deposit-notification-1',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.balance_before', 3000)
            ->assertJsonPath('data.balance_after', 4000);

        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '4000.00']);
        $notification = $patron->notifications()->firstOrFail();

        $this->actingAs($patron, 'web')->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('unread_count', 1);

        $this->actingAs($patron, 'web')->patchJson('/api/notifications/'.$notification->id.'/read')
            ->assertOk();

        $otherUser = User::factory()->create(['status' => 'active']);
        $this->actingAs($otherUser, 'sanctum')->getJson('/api/user')
            ->assertJsonPath('id', $otherUser->id);

        $this->patchJson('/api/notifications/'.$notification->id.'/read')
            ->assertNotFound();

        $this->assertDatabaseHas('notifications', [
            'id' => $notification->id,
            'notifiable_id' => $patron->id,
        ]);
        $this->assertNotNull($notification->fresh()->read_at);
    }

    public function test_patron_can_reverse_a_deposit_only_once(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $student = Student::create([
            'student_number' => 'B-9005',
            'full_name' => 'Deposit Reversal',
            'gender' => 'male',
            'balance' => 3000.00,
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);

        $deposit = $this->actingAs($patron, 'web')->postJson('/api/transactions/deposit', [
            'student_id' => $student->id,
            'amount' => 2000,
            'uuid' => 'deposit-to-reverse',
        ])->assertCreated()->json('data');

        $this->postJson("/api/transactions/{$deposit['id']}/reverse")
            ->assertCreated()
            ->assertJsonPath('data.type', 'reversal')
            ->assertJsonPath('data.related_transaction_id', $deposit['id'])
            ->assertJsonPath('data.balance_after', 3000);

        $this->postJson("/api/transactions/{$deposit['id']}/reverse")
            ->assertStatus(409);

        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '3000.00']);
        $this->assertDatabaseCount('transactions', 2);
    }

    public function test_canteen_server_can_reverse_its_own_purchase_and_restore_student_balance(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');
        $student = Student::create([
            'student_number' => 'B-9006',
            'full_name' => 'Purchase Reversal',
            'gender' => 'male',
            'balance' => 50000.00,
            'daily_limit' => 20000.00,
        ]);

        $purchase = $this->actingAs($server, 'web')->postJson('/api/transactions/purchase', [
            'student_id' => $student->id,
            'amount' => 20000,
            'uuid' => 'purchase-to-reverse',
        ])->assertCreated()->json('data');

        $this->postJson("/api/transactions/{$purchase['id']}/reverse")
            ->assertCreated()
            ->assertJsonPath('data.type', 'reversal')
            ->assertJsonPath('data.balance_after', 50000);

        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '50000.00']);

        $this->postJson('/api/transactions/purchase', [
            'student_id' => $student->id,
            'amount' => 20000,
            'uuid' => 'purchase-after-reversal',
        ])->assertCreated();

        $this->getJson('/api/reports/daily')
            ->assertOk()
            ->assertJsonPath('total_spent', 20000);

        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '30000.00']);
    }

    public function test_deposit_reversal_is_rejected_when_the_deposit_has_been_spent(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $student = Student::create([
            'student_number' => 'B-9007',
            'full_name' => 'Spent Deposit',
            'gender' => 'male',
            'balance' => 0.00,
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);

        $deposit = $this->actingAs($patron, 'web')->postJson('/api/transactions/deposit', [
            'student_id' => $student->id,
            'amount' => 2000,
            'uuid' => 'spent-deposit',
        ])->assertCreated()->json('data');
        $student->update(['balance' => 1000.00]);

        $this->postJson("/api/transactions/{$deposit['id']}/reverse")
            ->assertStatus(422)
            ->assertJsonPath('message', 'The student has already spent some of this deposit, so it cannot be fully reversed.');

        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '1000.00']);
        $this->assertDatabaseCount('transactions', 1);
    }

    public function test_notification_inbox_filters_by_day_and_marks_only_that_day_read(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $today = now()->toDateString();
        $yesterday = now()->subDay()->toDateString();

        foreach ([
            [$today, 'Today transaction'],
            [$yesterday, 'Yesterday transaction'],
        ] as [$date, $message]) {
            $patron->notifications()->create([
                'id' => (string) Str::uuid(),
                'type' => 'test',
                'data' => ['message' => $message],
                'created_at' => "{$date} 12:00:00",
                'updated_at' => "{$date} 12:00:00",
            ]);
        }

        $this->actingAs($patron, 'web')->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.data.message', 'Today transaction')
            ->assertJsonPath('unread_count', 1);

        $this->getJson('/api/notifications?date='.$yesterday)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.data.message', 'Yesterday transaction')
            ->assertJsonPath('unread_count', 1);

        $this->patchJson('/api/notifications/read-all', ['date' => $yesterday])->assertOk();

        $this->getJson('/api/notifications?date='.$yesterday)
            ->assertJsonPath('unread_count', 0);
        $this->getJson('/api/notifications/unread-count')
            ->assertJsonPath('unread_count', 1);
    }

    public function test_broadcast_channel_auth_is_limited_to_the_authenticated_user(): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => 'test-app',
        ]);
        Broadcast::forgetDrivers();
        Broadcast::channel('users.{userId}', function (User $user, int $userId): bool {
            return (int) $user->id === $userId;
        });

        $user = User::factory()->create(['status' => 'active']);
        $otherUser = User::factory()->create(['status' => 'active']);

        $this->actingAs($user, 'sanctum')->postJson('/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => 'private-users.'.$user->id,
        ])->assertOk();

        $this->actingAs($otherUser, 'sanctum')->getJson('/api/user')
            ->assertJsonPath('id', $otherUser->id);

        $this->postJson('/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => 'private-users.'.$user->id,
        ])->assertForbidden();
    }

    public function test_patron_cannot_deposit_to_an_unassigned_student(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $otherPatron = User::factory()->create(['status' => 'active']);
        $otherPatron->assignRole('patron');

        $student = Student::create([
            'student_number' => 'B-9005',
            'full_name' => 'Not Managed',
            'gender' => 'male',
            'balance' => 100.00,
            'managed_by' => $otherPatron->id,
            'created_by' => $otherPatron->id,
        ]);

        $this->actingAs($patron, 'web')->postJson('/api/transactions/deposit', [
            'student_id' => $student->id,
            'amount' => 25.00,
            'uuid' => 'forbidden-deposit-1',
        ])->assertForbidden();

        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '100.00']);
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_purchase_uses_entered_amount_and_is_idempotent_by_uuid(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');
        $student = Student::create([
            'student_number' => 'B-9010',
            'full_name' => 'Amount Tamper Test',
            'gender' => 'male',
            'balance' => 1000.00,
        ]);

        $first = $this->actingAs($server, 'web')->postJson('/api/transactions/purchase', [
            'student_id' => $student->id,
            'uuid' => 'entered-amount-1',
            'amount' => 150,
        ]);

        $first->assertCreated()
            ->assertJsonPath('data.amount', 150)
            ->assertJsonPath('data.balance_after', 850);

        $this->postJson('/api/transactions/purchase', [
            'student_id' => $student->id,
            'uuid' => 'entered-amount-1',
            'amount' => 500,
        ])->assertOk()
            ->assertJsonPath('data.amount', 150);

        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '850.00']);
        $this->assertDatabaseCount('transactions', 1);
    }

    public function test_purchase_rejects_inactive_students(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');
        $student = Student::create([
            'student_number' => 'B-9011',
            'full_name' => 'Inactive Buyer',
            'gender' => 'male',
            'balance' => 1000.00,
            'is_active' => false,
        ]);

        $this->actingAs($server, 'web')->postJson('/api/transactions/purchase', [
            'student_id' => $student->id,
            'amount' => 450,
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'STUDENT_INACTIVE');

        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_purchase_enforces_daily_spending_limit(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');
        $student = Student::create([
            'student_number' => 'B-9012',
            'full_name' => 'Daily Limit Buyer',
            'gender' => 'male',
            'balance' => 1000.00,
            'daily_limit' => 400.00,
        ]);

        $this->actingAs($server, 'web')->postJson('/api/transactions/purchase', [
            'student_id' => $student->id,
            'amount' => 500,
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'DAILY_LIMIT_EXCEEDED');

        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '1000.00']);
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_canteen_server_cannot_access_menu_items(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');

        $this->actingAs($server, 'web')->getJson('/api/menu')
            ->assertForbidden();
    }

    public function test_canteen_server_can_charge_entered_amount_and_notify_guardian(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');
        $student = Student::create([
            'student_number' => 'B-9013',
            'full_name' => 'Server Sale Student',
            'gender' => 'male',
            'balance' => 500.00,
            'managed_by' => $patron->id,
            'created_by' => $patron->id,
        ]);

        $this->actingAs($server, 'web')->postJson('/api/transactions/purchase', [
            'student_id' => $student->id,
            'uuid' => 'server-sale-1',
            'amount' => 350,
        ])->assertCreated()
            ->assertJsonPath('data.amount', 350)
            ->assertJsonPath('data.balance_after', 150);

        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '150.00']);
        $this->assertDatabaseCount('notifications', 1);

        $this->actingAs($patron, 'web')->getJson('/api/transactions/history?student_id='.$student->id)
            ->assertOk()
            ->assertJsonPath('data.0.amount', 350);
    }

    public function test_patron_cannot_read_the_canteen_menu_endpoint(): void
    {
        $patron = User::factory()->create(['status' => 'active']);
        $patron->assignRole('patron');

        $this->actingAs($patron, 'web')->getJson('/api/menu')->assertForbidden();
    }

    public function test_purchase_rejects_legacy_menu_item_payloads(): void
    {
        $server = User::factory()->create(['status' => 'active']);
        $server->assignRole('canteen-server');
        $student = Student::create([
            'student_number' => 'B-9014',
            'full_name' => 'Amount Only Buyer',
            'gender' => 'male',
            'balance' => 1000.00,
        ]);
        $this->actingAs($server, 'web')->postJson('/api/transactions/purchase', [
            'student_id' => $student->id,
            'amount' => 200,
            'items' => [['menu_item_id' => 1, 'quantity' => 1]],
        ])->assertUnprocessable();

        $this->assertDatabaseHas('students', ['id' => $student->id, 'balance' => '1000.00']);
        $this->assertDatabaseCount('transactions', 0);
    }
}
