"""
Staff attendance routes (Blueprint). Thin HTTP layer — all logic lives
in services/staff_attendance_service.py.
"""
from flask import Blueprint, request, session

from repositories.staff_attendance_repository import StaffAttendanceRepository
from services.staff_attendance_service import (
    StaffAttendanceService,
    StaffAttendanceValidationError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

staff_attendance_bp = Blueprint('staff_attendance', __name__)

staff_attendance_repository = StaffAttendanceRepository()
staff_attendance_service = StaffAttendanceService(staff_attendance_repository)


@staff_attendance_bp.route('/api/staff-attendance/roster', methods=['GET'])
@require_role('viewer')
def api_get_staff_roster():
    date = request.args.get('date', '').strip()
    if not date:
        return error_response("date is required", status=400)

    result = staff_attendance_service.get_roster(date)
    return success_response(result)


@staff_attendance_bp.route('/api/staff-attendance/mark', methods=['POST'])
@require_role('admin')
def api_mark_staff_attendance():
    data = request.json or {}
    marked_by = session.get('username', 'unknown')
    try:
        staff_attendance_service.mark_attendance(data, marked_by)
        return success_response(message="Staff attendance saved successfully")
    except StaffAttendanceValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@staff_attendance_bp.route('/api/staff-attendance/teacher/<teacher_id>', methods=['GET'])
@require_role('viewer')
def api_get_teacher_history(teacher_id):
    month = request.args.get('month', '').strip()
    year = request.args.get('year', '').strip()

    if not month or not year:
        return error_response("month and year are required", status=400)

    try:
        result = staff_attendance_service.get_teacher_history(teacher_id, month, year)
        return success_response(result)
    except ValueError:
        return error_response("month and year must be numbers", status=400)


@staff_attendance_bp.route('/api/staff-attendance/summary', methods=['GET'])
@require_role('viewer')
def api_get_staff_summary():
    month = request.args.get('month', '').strip()
    year = request.args.get('year', '').strip()

    if not month or not year:
        return error_response("month and year are required", status=400)

    try:
        result = staff_attendance_service.get_staff_summary(month, year)
        return success_response(result)
    except ValueError:
        return error_response("month and year must be numbers", status=400)
