<?php

namespace App\Services;

use App\Models\Student;
use App\Models\Transaction;
use App\Models\User;
use App\Events\TransactionProcessed;
use App\Notifications\WalletTransactionNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

class WalletService
{
    public function deposit(Student $student, float $amount, User $processor, ?string $note = null, ?string $uuid = null): Transaction
    {
        return $this->applyTransaction($student, 'deposit', $amount, $processor, $note, uuid: $uuid);
    }

    public function purchase(Student $student, float $amount, User $processor, ?string $note = null, ?array $items = null, ?string $uuid = null): Transaction
    {
        if ($amount <= 0) {
            throw new \InvalidArgumentException('Purchase amount must be greater than zero.');
        }

        return $this->applyTransaction($student, 'purchase', $amount, $processor, $note, $items, $uuid);
    }

    public function refund(Student $student, float $amount, User $processor, ?string $reason = null, ?string $uuid = null): Transaction
    {
        if ($amount <= 0) {
            throw new \InvalidArgumentException('Refund amount must be greater than zero.');
        }

        return $this->applyTransaction($student, 'refund', $amount, $processor, $reason, uuid: $uuid);
    }

    public function reverse(Transaction $original, User $processor): Transaction
    {
        return DB::transaction(function () use ($original, $processor) {
            $original = Transaction::query()->lockForUpdate()->findOrFail($original->id);

            if (! in_array($original->type, ['deposit', 'purchase'], true) || $original->status !== 'completed') {
                throw new \InvalidArgumentException('Only completed deposits and purchases can be reversed.');
            }

            if ($original->relatedTransactions()->where('type', 'reversal')->exists()) {
                throw new \RuntimeException('TRANSACTION_ALREADY_REVERSED');
            }

            $student = Student::query()->lockForUpdate()->findOrFail($original->student_id);
            $before = (float) $student->balance;
            $amount = (float) $original->amount;

            if ($original->type === 'deposit' && $before < $amount) {
                throw new \RuntimeException('INSUFFICIENT BALANCE TO REVERSE DEPOSIT');
            }

            $after = $original->type === 'deposit'
                ? $before - $amount
                : $before + $amount;

            $student->balance = $after;
            $student->save();

            $transaction = Transaction::create([
                'uuid' => (string) Str::uuid(),
                'student_id' => $student->id,
                'type' => 'reversal',
                'amount' => $amount,
                'balance_before' => $before,
                'balance_after' => $after,
                'note' => "Reversal of {$original->type} #{$original->id}",
                'processed_by' => $processor->id,
                'related_transaction_id' => $original->id,
                'status' => 'completed',
                'client_created_at' => now(),
            ]);

            $this->notifyTransaction($transaction, $student);

            return $transaction;
        });
    }

    protected function applyTransaction(
        Student $student,
        string $type,
        float $amount,
        User $processor,
        ?string $note = null,
        ?array $items = null,
        ?string $uuid = null,
    ): Transaction {
        return DB::transaction(function () use ($student, $type, $amount, $processor, $note, $items, $uuid) {
            $student = Student::query()->lockForUpdate()->findOrFail($student->id);

            $before = (float) $student->balance;

            if ($type === 'purchase' && $before < $amount) {
                throw new \RuntimeException('INSUFFICIENT BALANCE');
            }

            if ($type === 'purchase' && $student->daily_limit !== null) {
                $startOfDay = now()->startOfDay();
                $dailySpend = (float) Transaction::query()
                    ->where('student_id', $student->id)
                    ->where('status', 'completed')
                    ->where('created_at', '>=', $startOfDay)
                    ->where('created_at', '<', $startOfDay->copy()->addDay())
                    ->selectRaw("COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount WHEN type = 'refund' THEN -amount WHEN type = 'reversal' AND related_transaction_id IN (SELECT id FROM transactions WHERE type = 'purchase') THEN -amount ELSE 0 END), 0) as daily_spend")
                    ->value('daily_spend');

                if (round($dailySpend * 100) + round($amount * 100) > round((float) $student->daily_limit * 100)) {
                    throw new \RuntimeException('DAILY_LIMIT_EXCEEDED');
                }
            }

            $after = $before;

            if ($type === 'deposit') {
                $after = $before + $amount;
            }

            if ($type === 'purchase') {
                $after = $before - $amount;
            }

            if ($type === 'refund') {
                $after = $before + $amount;
            }

            $student->balance = $after;
            $student->save();

            $transaction = Transaction::create([
                'uuid' => $uuid ?? (string) Str::uuid(),
                'student_id' => $student->id,
                'type' => $type,
                'amount' => $amount,
                'balance_before' => $before,
                'balance_after' => $after,
                'items' => $items,
                'note' => $note,
                'processed_by' => $processor->id,
                'status' => 'completed',
                'client_created_at' => now(),
            ]);

            $this->notifyTransaction($transaction, $student);

            return $transaction;
        });
    }

    protected function notifyTransaction(Transaction $transaction, Student $student): void
    {
        $recipientIds = array_values(array_unique(array_filter([
            $student->managed_by,
            $student->created_by,
        ])));
        $recipients = User::query()->whereIn('id', $recipientIds)->get();

        Notification::send($recipients, new WalletTransactionNotification($transaction));

        DB::afterCommit(function () use ($transaction, $recipientIds): void {
            foreach ($recipientIds as $recipientId) {
                TransactionProcessed::dispatch($transaction, (int) $recipientId);
            }
        });
    }
}
