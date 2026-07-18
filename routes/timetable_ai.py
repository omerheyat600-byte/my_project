"""
Timetable Generator routes (Blueprint) — AI Tools.
Thin HTTP layer — all logic lives in services/timetable_ai_service.py.
Reuses the existing `timetable` table/API (routes/timetable.py) for
manual single-slot edits; this blueprint only adds bulk generation.
"""
from flask import Blueprint, request, session

from repositories.class_repository import ClassRepository
from repositories.teacher_repository import TeacherRepository
from repositories.timetable_repository import TimetableRepository
from repositories.settings_repository import SettingsRepository
from services.timetable_ai_service import (
    TimetableGeneratorService, TimetableGenClassNotFoundError, TimetableGenValidationError
)
from utils.auth import require_role
from utils.response import success_response, error_response

timetable_ai_bp = Blueprint('timetable_ai', __name__)

class_repository = ClassRepository()
teacher_repository = TeacherRepository()
timetable_repository = TimetableRepository()
settings_repository = SettingsRepository()
timetable_ai_service = TimetableGeneratorService(
    class_repository, teacher_repository, timetable_repository, settings_repository
)


def _current_user():
    return session.get('username') or session.get('user_id')


@timetable_ai_bp.route('/api/ai/timetable/context/<int:class_id>', methods=['GET'])
@require_role('viewer')
def api_timetable_gen_context(class_id):
    try:
        return success_response(timetable_ai_service.get_context(class_id))
    except TimetableGenClassNotFoundError as e:
        return error_response(str(e), status=404)


@timetable_ai_bp.route('/api/ai/timetable/generate', methods=['POST'])
@require_role('teacher')
def api_timetable_gen_generate():
    data = request.json or {}
    class_id = data.get('class_id')
    if not class_id:
        return error_response("class_id is required", status=400)
    try:
        result = timetable_ai_service.generate(class_id, data, created_by=_current_user())
        return success_response(result, message="Timetable generated")
    except TimetableGenClassNotFoundError as e:
        return error_response(str(e), status=404)
    except TimetableGenValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)
