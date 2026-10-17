<?php

namespace App\Notifications;

use App\Models\Transaction;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class WalletTransactionNotification extends Notification
{
    use Queueable;

    public function __construct(protected Transaction $transaction)
    {
    }

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'transaction_id' => $this->transaction->id,
            'uuid' => $this->transaction->uuid,
            'student_id' => $this->transaction->student_id,
            'student_name' => $this->transaction->student?->full_name,
            'type' => $this->transaction->type,
            'amount' => (float) $this->transaction->amount,
            'balance_after' => (float) $this->transaction->balance_after,
            'message' => ucfirst($this->transaction->type).' recorded for '.$this->transaction->student?->full_name.'.',
        ];
    }
}
