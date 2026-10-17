<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StudentStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() && $this->user()->hasRole(['super-admin', 'patron', 'matron']);
    }

    public function rules(): array
    {
        return [
            'student_number' => ['required', 'string', 'max:255', 'unique:students,student_number'],
            'full_name' => ['required', 'string', 'max:255'],
            'gender' => ['required', 'in:male,female'],
            'class' => ['nullable', 'string', 'max:100'],
            'guardian_name' => ['nullable', 'string', 'max:255'],
            'guardian_phone' => ['nullable', 'string', 'max:50'],
            'balance' => ['prohibited'],
            'daily_limit' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
            'face_descriptor' => ['nullable', 'array'],
        ];
    }
}
