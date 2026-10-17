<?php

namespace App\Events;

use App\Http\Resources\TransactionResource;
use App\Models\Transaction;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TransactionProcessed implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Transaction $transaction,
        public int $recipientId,
    ) {
    }

    public function broadcastOn(): array
    {
        return [new PrivateChannel('users.'.$this->recipientId)];
    }

    public function broadcastAs(): string
    {
        return 'transaction.processed';
    }

    public function broadcastWith(): array
    {
        return ['transaction' => (new TransactionResource($this->transaction))->resolve()];
    }
}
