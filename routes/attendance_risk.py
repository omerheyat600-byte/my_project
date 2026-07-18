"""
Attendance Risk routes (Blueprint) — AI Tools.
Thin HTTP layer — all logic lives in services/attendance_risk_service.py.
Read-only: analyzes existing attendance records, writes nothing.
"""
from flask import Blueprint, request

from repositories.attendance_risk_repository import AttendanceRiskRepository
from repositories.settings_repository import SettingsRepository
from services.attendance_risk_service import (
    AttendanceRiskService, AttendanceRiskStudentNotFoundError, DEFAULT_WINDOW_DAYS
)
from utils.auth import require_role
from utils.response import success_response, error_response

attendance_risk_bp = Blueprint('attendance_risk', __name__)

attendance_risk_repository = AttendanceRiskRepository()
settings_repository = SettingsRepository()
attendance_risk_service = AttendanceRiskService(attendance_risk_repository, settings_repository)


def _window_days():
    try:
        return max(7, min(180, int(request.args.get('window_days', DEFAULT_WINDOW_DAYS))))
    except (TypeError, ValueError):
        return DEFAULT_WINDOW_DAYS


@attendance_risk_bp.route('/api/ai/attendance-risk/class', methods=['GET'])
@require_role('viewer')
def api_attendance_risk_class():
    class_name = request.args.get('class_name', '').strip() or None
    mode = request.args.get('mode', 'auto')
    try:
        return success_response(attendance_risk_service.analyze_class(class_name, window_days=_window_days(), mode=mode))
    except Exception as e:
        return error_response(str(e), status=500)


@attendance_risk_bp.route('/api/ai/attendance-risk/student/<student_id>', methods=['GET'])
@require_role('viewer')
def api_attendance_risk_student(student_id):
    mode = request.args.get('mode', 'auto')
    try:
        return success_response(attendance_risk_service.analyze_student(student_id, window_days=_window_days(), mode=mode))
    except AttendanceRiskStudentNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)
