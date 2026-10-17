<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TransactionStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null && $this->user()->status === 'active';
    }

    public function rules(): array
    {
        return [
            'student_id' => ['required', 'exists:students,id'],
            'amount' => ['required', 'integer', 'min:1'],
            'uuid' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:500'],
            'items' => ['nullable', 'array'],
        ];
    }
}
