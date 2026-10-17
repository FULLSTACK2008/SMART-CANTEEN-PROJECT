<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class StudentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'student_number' => $this->student_number,
            'full_name' => $this->full_name,
            'gender' => $this->gender,
            'class' => $this->class,
            'guardian_name' => $this->guardian_name,
            'guardian_phone' => $this->guardian_phone,
            'balance' => (float) $this->balance,
            'daily_limit' => $this->daily_limit ? (float) $this->daily_limit : null,
            'is_active' => (bool) $this->is_active,
            'notes' => $this->notes,
            'photo_path' => $this->photo_path,
            'photo_url' => $this->photo_path
                ? (Str::startsWith($this->photo_path, ['http://', 'https://'])
                    ? $this->photo_path
                    : Storage::disk('public')->url($this->photo_path))
                : null,
            'managed_by' => $this->managed_by,
            'created_by' => $this->created_by,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
            'deleted_at' => $this->deleted_at?->toISOString(),
        ];
    }
}
