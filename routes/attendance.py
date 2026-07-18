"""
Attendance routes (Blueprint). Thin HTTP layer — all logic lives in
services/attendance_service.py.
"""
from flask import Blueprint, request, session

from repositories.attendance_repository import AttendanceRepository
from repositories.notification_repository import NotificationRepository
from services.attendance_service import (
    AttendanceService,
    AttendanceValidationError,
    ClassNotFoundError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

attendance_bp = Blueprint('attendance', __name__)

attendance_repository = AttendanceRepository()
notification_repo = NotificationRepository()
attendance_service = AttendanceService(attendance_repository, notification_repo)


@attendance_bp.route('/api/attendance/roster', methods=['GET'])
@require_role('viewer')
def api_get_roster():
    class_id = request.args.get('class_id', '').strip()
    date = request.args.get('date', '').strip()

    if not class_id or not date:
        return error_response("class_id and date are required", status=400)

    try:
        result = attendance_service.get_class_roster(int(class_id), date)
        return success_response(result)
    except ClassNotFoundError as e:
        return error_response(str(e), status=404)
    except ValueError:
        return error_response("class_id must be a number", status=400)


@attendance_bp.route('/api/attendance/mark', methods=['POST'])
@require_role('teacher')
def api_mark_attendance():
    data = request.json or {}
    marked_by = session.get('username', 'unknown')
    try:
        attendance_service.mark_attendance(data, marked_by)
        return success_response(message="Attendance saved successfully")
    except AttendanceValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except ClassNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@attendance_bp.route('/api/attendance/student/<student_id>', methods=['GET'])
@require_role('viewer')
def api_get_student_history(student_id):
    month = request.args.get('month', '').strip()
    year = request.args.get('year', '').strip()

    if not month or not year:
        return error_response("month and year are required", status=400)

    try:
        result = attendance_service.get_student_history(student_id, month, year)
        return success_response(result)
    except ValueError:
        return error_response("month and year must be numbers", status=400)


@attendance_bp.route('/api/attendance/summary', methods=['GET'])
@require_role('viewer')
def api_get_class_summary():
    class_id = request.args.get('class_id', '').strip()
    month = request.args.get('month', '').strip()
    year = request.args.get('year', '').strip()

    if not class_id or not month or not year:
        return error_response("class_id, month, and year are required", status=400)

    try:
        result = attendance_service.get_class_summary(int(class_id), month, year)
        return success_response(result)
    except ClassNotFoundError as e:
        return error_response(str(e), status=404)
    except ValueError:
        return error_response("class_id, month, and year must be numbers", status=400)
