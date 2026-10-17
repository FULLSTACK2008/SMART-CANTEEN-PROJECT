<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TransactionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'uuid' => $this->uuid,
            'student_id' => $this->student_id,
            'type' => $this->type,
            'amount' => (float) $this->amount,
            'balance_before' => (float) $this->balance_before,
            'balance_after' => (float) $this->balance_after,
            'items' => $this->items,
            'note' => $this->note,
            'processed_by' => $this->processed_by,
            'related_transaction_id' => $this->related_transaction_id,
            'is_reversed' => (int) $this->related_transactions_count > 0,
            'status' => $this->status,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
