"""
Student routes (Blueprint). Thin HTTP layer — all logic lives in
services/student_service.py.
"""
import os
import uuid
from flask import Blueprint, request
from werkzeug.utils import secure_filename

import config
from repositories.student_repository import StudentRepository
from services.student_service import (
    StudentService,
    StudentNotFoundError,
    StudentValidationError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

students_bp = Blueprint('students', __name__)

# Explicit dependency injection: the repository is constructed once and
# handed to the service, rather than the service reaching out and
# constructing its own dependency. Makes it trivial to swap in a fake/mock
# repository in tests without touching the service or routes.
student_repository = StudentRepository()
student_service = StudentService(student_repository)


def _allowed_photo_ext(filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return (ext in config.STUDENT_PHOTO_ALLOWED_EXTENSIONS), ext


@students_bp.route('/api/students', methods=['GET'])
@require_role('viewer')
def api_get_students():
    q = request.args.get('q', '').strip()
    grade_filter = request.args.get('grade', '').strip()
    result = student_service.list_students(q, grade_filter)
    return success_response(result)


@students_bp.route('/api/students', methods=['POST'])
@require_role('teacher')
def api_create_student():
    data = request.json or {}
    try:
        sid = student_service.create_student(data)
        return success_response({"id": sid}, message="Student created successfully", status=201)
    except StudentValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@students_bp.route('/api/students/<sid>', methods=['GET'])
@require_role('viewer')
def api_get_student(sid):
    try:
        student = student_service.get_student(sid)
        return success_response(student)
    except StudentNotFoundError as e:
        return error_response(str(e), status=404)


@students_bp.route('/api/students/<sid>', methods=['PUT'])
@require_role('teacher')
def api_update_student(sid):
    data = request.json or {}
    try:
        student_service.update_student(sid, data)
        return success_response(message="Student updated successfully")
    except StudentValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except StudentNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@students_bp.route('/api/students/<sid>', methods=['DELETE'])
@require_role('teacher')
def api_delete_student(sid):
    try:
        student_service.delete_student(sid)
        return success_response(message="Student deleted successfully")
    except StudentNotFoundError as e:
        return error_response(str(e), status=404)


@students_bp.route('/api/students/list', methods=['GET'])
@require_role('viewer')
def api_students_list():
    students = student_service.list_id_name()
    return success_response({"students": students})


@students_bp.route('/api/fix-student-grades', methods=['GET'])
@require_role('teacher')
def fix_student_grades():
    try:
        updated = student_service.fix_student_grades()
        return success_response({"updated": updated}, message="Student grades fixed successfully")
    except Exception as e:
        return error_response(str(e), status=500)


@students_bp.route('/api/students/next-admission-no', methods=['GET'])
@require_role('teacher')
def api_next_admission_no():
    return success_response({"admission_no": student_service.get_next_admission_no()})


@students_bp.route('/api/students/reset-roll-numbers', methods=['POST'])
@require_role('teacher')
def api_reset_roll_numbers():
    data = request.json or {}
    grade = (data.get('grade') or '').strip()
    try:
        updated = student_service.reset_roll_numbers(grade)
        return success_response(
            {"updated": updated},
            message=f"Roll numbers reset for {updated} student(s) in {grade}"
        )
    except StudentValidationError as e:
        return error_response("; ".join(e.errors), status=400)


@students_bp.route('/api/students/<sid>/roll-no', methods=['PUT'])
@require_role('teacher')
def api_set_roll_no(sid):
    data = request.json or {}
    try:
        student_service.set_roll_no(sid, data.get('roll_no'))
        return success_response(message="Roll number updated")
    except StudentNotFoundError as e:
        return error_response(str(e), status=404)


@students_bp.route('/api/students/<sid>/photo', methods=['POST'])
@require_role('teacher')
def api_upload_student_photo(sid):
    if not student_repository.exists(sid):
        return error_response("Student not found", status=404)

    file = request.files.get('photo')
    if not file or not file.filename:
        return error_response("No photo file provided", status=400)

    ok, ext = _allowed_photo_ext(file.filename)
    if not ok:
        return error_response(
            f"Unsupported file type. Allowed: {', '.join(sorted(config.STUDENT_PHOTO_ALLOWED_EXTENSIONS))}",
            status=400
        )

    # Read into memory first so we can enforce a size cap regardless of
    # what (if anything) the client claims in Content-Length.
    contents = file.read()
    if len(contents) > config.STUDENT_PHOTO_MAX_BYTES:
        max_mb = config.STUDENT_PHOTO_MAX_BYTES / (1024 * 1024)
        return error_response(f"Photo is too large — max {max_mb:.0f}MB", status=400)

    # Unique filename per upload (rather than sid.ext) so browsers can't
    # serve a stale cached photo after a re-upload.
    filename = secure_filename(f"{sid}_{uuid.uuid4().hex[:8]}.{ext}")
    filepath = os.path.join(config.UPLOADS_STUDENTS_DIR, filename)

    try:
        with open(filepath, 'wb') as f:
            f.write(contents)
    except OSError as e:
        return error_response(f"Failed to save photo: {e}", status=500)

    photo_path = f"/uploads/students/{filename}"
    try:
        student_service.set_photo(sid, photo_path)
    except StudentNotFoundError as e:
        return error_response(str(e), status=404)

    return success_response({"photo_path": photo_path}, message="Photo uploaded successfully")


@students_bp.route('/api/students/<sid>/photo', methods=['DELETE'])
@require_role('teacher')
def api_delete_student_photo(sid):
    try:
        student_service.set_photo(sid, None)
        return success_response(message="Photo removed")
    except StudentNotFoundError as e:
        return error_response(str(e), status=404)
