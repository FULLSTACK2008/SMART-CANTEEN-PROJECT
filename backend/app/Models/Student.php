<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Student extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'student_number',
        'full_name',
        'gender',
        'class',
        'photo_path',
        'face_descriptor',
        'guardian_name',
        'guardian_phone',
        'balance',
        'daily_limit',
        'is_active',
        'notes',
        'managed_by',
        'created_by',
    ];

    protected $casts = [
        'face_descriptor' => 'array',
        'balance' => 'decimal:2',
        'daily_limit' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function managedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'managed_by');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }
}
