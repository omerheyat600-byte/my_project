"""
Timetable routes (Blueprint). Thin HTTP layer — all logic lives in
services/timetable_service.py.
"""
from flask import Blueprint, request

from repositories.timetable_repository import TimetableRepository
from services.timetable_service import (
    TimetableService,
    TimetableValidationError,
    ClassNotFoundError,
    TeacherConflictError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

timetable_bp = Blueprint('timetable', __name__)

timetable_repository = TimetableRepository()
timetable_service = TimetableService(timetable_repository)


@timetable_bp.route('/api/timetable/class/<int:class_id>', methods=['GET'])
@require_role('viewer')
def api_get_class_timetable(class_id):
    try:
        result = timetable_service.get_class_timetable(class_id)
        return success_response(result)
    except ClassNotFoundError as e:
        return error_response(str(e), status=404)


@timetable_bp.route('/api/timetable/slot', methods=['POST'])
@require_role('teacher')
def api_save_slot():
    data = request.json or {}
    try:
        timetable_service.save_slot(data)
        return success_response(message="Timetable slot saved successfully")
    except TimetableValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except ClassNotFoundError as e:
        return error_response(str(e), status=404)
    except TeacherConflictError as e:
        return error_response(str(e), status=409)
    except Exception as e:
        return error_response(str(e), status=500)


@timetable_bp.route('/api/timetable/slot/<int:class_id>/<day_of_week>/<int:period_number>', methods=['DELETE'])
@require_role('teacher')
def api_delete_slot(class_id, day_of_week, period_number):
    try:
        timetable_service.delete_slot(class_id, day_of_week, period_number)
        return success_response(message="Timetable slot removed")
    except TimetableValidationError as e:
        return error_response("; ".join(e.errors), status=400)


@timetable_bp.route('/api/timetable/teacher/<teacher_id>', methods=['GET'])
@require_role('viewer')
def api_get_teacher_timetable(teacher_id):
    result = timetable_service.get_teacher_timetable(teacher_id)
    return success_response(result)
