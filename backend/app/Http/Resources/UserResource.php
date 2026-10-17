<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'username' => $this->username,
            'email' => $this->email,
            'status' => $this->status,
            'locale' => $this->locale,
            'theme' => $this->theme,
            'roles' => $this->roles->pluck('name'),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
