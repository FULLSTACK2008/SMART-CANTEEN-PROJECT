<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StudentUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'student_number' => ['sometimes', 'string', 'max:255', 'unique:students,student_number,'.$this->route('student')->id],
            'full_name' => ['sometimes', 'string', 'max:255'],
            'class' => ['nullable', 'string', 'max:100'],
            'guardian_name' => ['nullable', 'string', 'max:255'],
            'guardian_phone' => ['nullable', 'string', 'max:50'],
            'balance' => ['prohibited'],
            'daily_limit' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
            'face_descriptor' => ['nullable', 'array'],
        ];
    }
}
