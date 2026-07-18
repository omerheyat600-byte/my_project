"""
Examination Module routes (Blueprint).

Covers the exam-administration surfaces that sit on top of the existing
exam-session subsystem (services/exam_service.py, ExamRepository):
Date Sheet, Seating Plan, Admit Card, Result Lock/Publish, Grace Marks,
GPA/CGPA, Position Holders, and Merit List.

Thin HTTP layer — all logic lives in services/exam_service.py.
"""
from flask import Blueprint, request

from repositories.exam_repository import ExamRepository
from services.exam_service import (
    ExamService,
    ExamClassNotFoundError,
    ExamNotFoundError,
    ExamValidationError,
    ExamResultLockedError,
    StudentNotFoundInExamError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

exams_bp = Blueprint('exams', __name__)

exam_repository = ExamRepository()
exam_service = ExamService(exam_repository)


# ---------- Date Sheet ----------

@exams_bp.route('/api/exam/<int:exam_id>/datesheet', methods=['GET'])
@require_role('viewer')
def api_get_datesheet(exam_id):
    try:
        return success_response({"datesheet": exam_service.get_datesheet(exam_id)})
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)


@exams_bp.route('/api/exam/<int:exam_id>/datesheet', methods=['POST'])
@require_role('teacher')
def api_save_datesheet_entry(exam_id):
    data = request.json or {}
    entry_id = data.get('id')
    try:
        new_id = exam_service.save_datesheet_entry(exam_id, data, entry_id)
        return success_response({"id": new_id}, message="Date sheet entry saved")
    except ExamValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@exams_bp.route('/api/exam/datesheet/<int:entry_id>', methods=['DELETE'])
@require_role('teacher')
def api_delete_datesheet_entry(entry_id):
    exam_service.delete_datesheet_entry(entry_id)
    return success_response(message="Date sheet entry deleted")


@exams_bp.route('/api/exam/<int:exam_id>/datesheet/bulk', methods=['POST'])
@require_role('teacher')
def api_save_datesheet_bulk(exam_id):
    data = request.json or {}
    rows = data.get('rows') or []
    try:
        ids = exam_service.save_datesheet_bulk(exam_id, rows)
        return success_response({"ids": ids}, message="Date sheet saved")
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


# ---------- Seating Plan ----------

@exams_bp.route('/api/exam/<int:exam_id>/seating', methods=['GET'])
@require_role('viewer')
def api_get_seating(exam_id):
    try:
        return success_response({"seating": exam_service.get_seating(exam_id)})
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)


@exams_bp.route('/api/exam/<int:exam_id>/seating/generate', methods=['POST'])
@require_role('teacher')
def api_generate_seating(exam_id):
    data = request.json or {}
    rooms = data.get('rooms', [])
    try:
        seating = exam_service.generate_seating(exam_id, rooms)
        return success_response({"seating": seating}, message="Seating plan generated")
    except (ExamNotFoundError, ExamValidationError) as e:
        msg = "; ".join(e.errors) if isinstance(e, ExamValidationError) else str(e)
        return error_response(msg, status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@exams_bp.route('/api/exam/<int:exam_id>/seating', methods=['POST'])
@require_role('teacher')
def api_save_seating(exam_id):
    data = request.json or {}
    entries = data.get('entries', [])
    try:
        seating = exam_service.save_seating_manual(exam_id, entries)
        return success_response({"seating": seating}, message="Seating plan saved")
    except Exception as e:
        return error_response(str(e), status=500)


@exams_bp.route('/api/exam/<int:exam_id>/seating', methods=['DELETE'])
@require_role('teacher')
def api_clear_seating(exam_id):
    exam_repository.clear_seating(exam_id)
    return success_response(message="Seating plan cleared")


# ---------- Admit Card ----------

@exams_bp.route('/api/exam/<int:exam_id>/admit-card/<student_id>', methods=['GET'])
@require_role('viewer')
def api_get_admit_card(exam_id, student_id):
    try:
        return success_response(exam_service.get_admit_card(exam_id, student_id))
    except (ExamNotFoundError, StudentNotFoundInExamError) as e:
        return error_response(str(e), status=404)


@exams_bp.route('/api/exam/<int:exam_id>/admit-cards', methods=['GET'])
@require_role('viewer')
def api_get_bulk_admit_cards(exam_id):
    try:
        return success_response({"admit_cards": exam_service.get_bulk_admit_cards(exam_id)})
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)


# ---------- Result Lock / Publish ----------

@exams_bp.route('/api/exam/<int:exam_id>/status', methods=['GET'])
@require_role('viewer')
def api_get_exam_status(exam_id):
    try:
        return success_response(exam_service.get_status(exam_id))
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)


@exams_bp.route('/api/exam/<int:exam_id>/lock', methods=['POST'])
@require_role('admin')
def api_lock_result(exam_id):
    try:
        exam_service.lock_result(exam_id)
        return success_response(message="Result locked")
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)


@exams_bp.route('/api/exam/<int:exam_id>/unlock', methods=['POST'])
@require_role('admin')
def api_unlock_result(exam_id):
    try:
        exam_service.unlock_result(exam_id)
        return success_response(message="Result unlocked")
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)


@exams_bp.route('/api/exam/<int:exam_id>/publish', methods=['POST'])
@require_role('admin')
def api_publish_result(exam_id):
    try:
        exam_service.publish_result(exam_id)
        return success_response(message="Result published")
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)


@exams_bp.route('/api/exam/<int:exam_id>/unpublish', methods=['POST'])
@require_role('admin')
def api_unpublish_result(exam_id):
    try:
        exam_service.unpublish_result(exam_id)
        return success_response(message="Result unpublished")
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)


# ---------- Grace Marks ----------

@exams_bp.route('/api/exam/<int:exam_id>/grace-marks', methods=['POST'])
@require_role('teacher')
def api_apply_grace_marks(exam_id):
    data = request.json or {}
    student_id = data.get('student_id')
    subject = data.get('subject')
    grace_marks = data.get('grace_marks', 0)

    if not student_id or not subject:
        return error_response("student_id and subject are required", status=400)

    try:
        exam_service.apply_grace_marks(exam_id, student_id, subject, grace_marks)
        return success_response(message="Grace marks applied")
    except ExamResultLockedError as e:
        return error_response(str(e), status=423)
    except (ExamNotFoundError, StudentNotFoundInExamError) as e:
        return error_response(str(e), status=404)
    except ExamValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


# ---------- GPA / CGPA ----------

@exams_bp.route('/api/exam/<int:exam_id>/gpa', methods=['GET'])
@require_role('viewer')
def api_get_gpa_list(exam_id):
    try:
        return success_response({"gpa_list": exam_service.get_gpa_list(exam_id)})
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)


@exams_bp.route('/api/student/<student_id>/cgpa', methods=['GET'])
@require_role('viewer')
def api_get_cgpa(student_id):
    return success_response(exam_service.get_cgpa(student_id))


# ---------- Position Holders ----------

@exams_bp.route('/api/exam/<int:exam_id>/position-holders', methods=['GET'])
@require_role('viewer')
def api_get_position_holders(exam_id):
    top_n = request.args.get('top', 3, type=int)
    try:
        return success_response({"position_holders": exam_service.get_position_holders(exam_id, top_n)})
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)


# ---------- Merit List ----------

@exams_bp.route('/api/exam/merit-list', methods=['GET'])
@require_role('viewer')
def api_get_merit_list():
    term = request.args.get('term', '').strip()
    year = request.args.get('year', '').strip()
    top_n = request.args.get('top', 10, type=int)
    class_id = request.args.get('class_id', '').strip() or None

    try:
        merit_list = exam_service.get_merit_list(term, year, top_n, class_id)
        return success_response({"merit_list": merit_list})
    except ExamValidationError as e:
        return error_response("; ".join(e.errors), status=400)
