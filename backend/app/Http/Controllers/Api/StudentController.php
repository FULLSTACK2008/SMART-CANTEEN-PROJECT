<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StudentStoreRequest;
use App\Http\Requests\StudentUpdateRequest;
use App\Http\Resources\StudentResource;
use App\Models\Student;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class StudentController extends Controller
{
    public function index(Request $request)
    {
        $query = Student::query();
        $this->scopeForManager($query, $request->user());

        if ($request->user()->hasRole('canteen-server')) {
            $query->where('is_active', true);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('full_name', 'like', "%{$search}%")
                    ->orWhere('student_number', 'like', "%{$search}%");
            });
        }

        if ($request->filled('class')) {
            $query->where('class', $request->class);
        }

        if ($request->filled('per_page')) {
            return $this->paginatedStudents($query->latest()->orderByDesc('id')->paginate(
                min(max($request->integer('per_page'), 1), 100)
            ));
        }

        return response()->json([
            'data' => StudentResource::collection($query->latest()->get()),
        ]);
    }

    public function recycle(Request $request)
    {
        abort_unless($request->user()->hasAnyRole(['super-admin', 'patron', 'matron']), 403);

        $query = Student::onlyTrashed();
        $this->scopeForManager($query, $request->user());

        if ($request->filled('per_page')) {
            return $this->paginatedStudents($query->latest('deleted_at')->orderByDesc('id')->paginate(
                min(max($request->integer('per_page'), 1), 100)
            ));
        }

        return response()->json([
            'data' => StudentResource::collection($query->latest('deleted_at')->get()),
        ]);
    }

    public function destroyAll(Request $request)
    {
        abort_unless($request->user()->hasAnyRole(['patron', 'matron']), 403);

        $query = Student::query();
        $this->scopeForManager($query, $request->user());
        $count = $query->count();
        $query->delete();

        return response()->json([
            'message' => 'Students moved to the recycle bin.',
            'deleted_count' => $count,
        ]);
    }

    public function store(StudentStoreRequest $request)
    {
        $this->authorize('create', Student::class);

        $data = $request->validated();
        $data['managed_by'] = $request->user()->id;
        $data['created_by'] = $request->user()->id;
        $data['gender'] = $request->user()->hasRole('patron') ? 'male' : 'female';

        $student = Student::create($data);

        return response()->json([
            'message' => 'Student created successfully.',
            'data' => new StudentResource($student),
        ], 201);
    }

    public function show(Student $student)
    {
        $this->authorize('view', $student);

        return response()->json([
            'data' => new StudentResource($student),
        ]);
    }

    public function uploadPhoto(Request $request, Student $student)
    {
        $this->authorize('update', $student);
        $validated = $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $oldPath = $student->photo_path;
        $student->photo_path = $validated['photo']->store("students/{$student->id}", 'public');
        $student->save();

        if ($oldPath && ! Str::startsWith($oldPath, ['http://', 'https://'])) {
            Storage::disk('public')->delete($oldPath);
        }

        return response()->json([
            'message' => 'Student photo uploaded successfully.',
            'data' => new StudentResource($student->fresh()),
        ]);
    }

    public function update(StudentUpdateRequest $request, Student $student)
    {
        $this->authorize('update', $student);

        $student->update($request->validated());

        return response()->json([
            'message' => 'Student updated successfully.',
            'data' => new StudentResource($student->fresh()),
        ]);
    }

    public function destroy(Student $student)
    {
        $this->authorize('delete', $student);

        $student->delete();

        return response()->json([
            'message' => 'Student moved to the recycle bin.',
        ]);
    }

    public function restore(string $student)
    {
        $student = Student::withTrashed()->findOrFail($student);
        $this->authorize('restore', $student);
        abort_unless($student->trashed(), 422, 'This student is not in the recycle bin.');

        $student->restore();

        return response()->json([
            'message' => 'Student restored successfully.',
            'data' => new StudentResource($student->fresh()),
        ]);
    }

    public function forceDelete(string $student)
    {
        $student = Student::withTrashed()->findOrFail($student);
        $this->authorize('forceDelete', $student);
        abort_unless($student->trashed(), 422, 'Move this student to the recycle bin before permanently deleting.');

        $student->forceDelete();

        return response()->json([
            'message' => 'Student permanently deleted.',
        ]);
    }

    public function search(Request $request)
    {
        $this->authorize('viewAny', Student::class);

        $query = Student::query();
        $this->scopeForManager($query, $request->user());

        if ($request->user()->hasRole('canteen-server')) {
            $query->where('is_active', true);
        }

        if ($request->filled('q')) {
            $query->where(function ($q) use ($request) {
                $q->where('full_name', 'like', "%{$request->q}%")
                    ->orWhere('student_number', 'like', "%{$request->q}%");
            });
        }

        return response()->json([
            'data' => StudentResource::collection($query->latest()->limit(20)->get()),
        ]);
    }

    protected function scopeForManager($query, $user): void
    {
        $gender = $user->hasRole('patron') ? 'male' : ($user->hasRole('matron') ? 'female' : null);

        if ($gender === null) {
            return;
        }

        $query->where('gender', $gender)
            ->where(function ($studentQuery) use ($user) {
                $studentQuery->where('managed_by', $user->id)
                    ->orWhere('created_by', $user->id);
            });
    }

    protected function paginatedStudents($paginator)
    {
        return response()->json([
            'data' => StudentResource::collection($paginator->items()),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }
}
