"""
Teacher routes (Blueprint). Thin HTTP layer — all logic lives in
services/teacher_service.py.
"""
from flask import Blueprint, request

from repositories.teacher_repository import TeacherRepository
from services.teacher_service import (
    TeacherService,
    TeacherNotFoundError,
    TeacherValidationError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

teachers_bp = Blueprint('teachers', __name__)

teacher_repository = TeacherRepository()
teacher_service = TeacherService(teacher_repository)


@teachers_bp.route('/api/teachers', methods=['GET'])
@require_role('viewer')
def api_get_teachers():
    q = request.args.get('q', '').strip()
    subject_filter = request.args.get('subject', '').strip()
    result = teacher_service.list_teachers(q, subject_filter)
    return success_response(result)


@teachers_bp.route('/api/teachers', methods=['POST'])
@require_role('teacher')
def api_create_teacher():
    data = request.json or {}
    try:
        tid = teacher_service.create_teacher(data)
        return success_response({"id": tid}, message="Teacher created successfully", status=201)
    except TeacherValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@teachers_bp.route('/api/teachers/<tid>', methods=['GET'])
@require_role('viewer')
def api_get_teacher(tid):
    try:
        teacher = teacher_service.get_teacher(tid)
        return success_response(teacher)
    except TeacherNotFoundError as e:
        return error_response(str(e), status=404)


@teachers_bp.route('/api/teachers/<tid>', methods=['PUT'])
@require_role('teacher')
def api_update_teacher(tid):
    data = request.json or {}
    try:
        teacher_service.update_teacher(tid, data)
        return success_response(message="Teacher updated successfully")
    except TeacherValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except TeacherNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@teachers_bp.route('/api/teachers/<tid>', methods=['DELETE'])
@require_role('teacher')
def api_delete_teacher(tid):
    try:
        teacher_service.delete_teacher(tid)
        return success_response(message="Teacher deleted successfully")
    except TeacherNotFoundError as e:
        return error_response(str(e), status=404)


@teachers_bp.route('/api/teachers/list', methods=['GET'])
@require_role('viewer')
def api_teachers_list():
    teachers = teacher_service.list_id_name()
    return success_response({"teachers": teachers})
