"""
Lesson Planner routes (Blueprint) — AI Tools.
Thin HTTP layer — all logic lives in services/lesson_plan_service.py.
"""
from flask import Blueprint, request, session

from repositories.lesson_plan_repository import LessonPlanRepository
from repositories.settings_repository import SettingsRepository
from services.lesson_plan_service import LessonPlanService, LessonPlanValidationError, LessonPlanNotFoundError
from utils.auth import require_role
from utils.response import success_response, error_response

lesson_plan_bp = Blueprint('lesson_plan', __name__)

lesson_plan_repository = LessonPlanRepository()
settings_repository = SettingsRepository()
lesson_plan_service = LessonPlanService(lesson_plan_repository, settings_repository)


def _current_user():
    return session.get('username') or session.get('user_id')


@lesson_plan_bp.route('/api/ai/lesson-plan/generate', methods=['POST'])
@require_role('teacher')
def api_generate_lesson_plan():
    data = request.json or {}
    try:
        plan = lesson_plan_service.generate_plan(data, created_by=_current_user())
        return success_response({"plan": plan}, message="Lesson plan generated")
    except LessonPlanValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@lesson_plan_bp.route('/api/ai/lesson-plan', methods=['GET'])
@require_role('viewer')
def api_list_lesson_plans():
    class_id = request.args.get('class_id', '').strip() or None
    subject = request.args.get('subject', '').strip() or None
    return success_response({"plans": lesson_plan_service.list_plans(class_id, subject)})


@lesson_plan_bp.route('/api/ai/lesson-plan/<int:plan_id>', methods=['GET'])
@require_role('viewer')
def api_get_lesson_plan(plan_id):
    try:
        return success_response({"plan": lesson_plan_service.get_plan(plan_id)})
    except LessonPlanNotFoundError as e:
        return error_response(str(e), status=404)


@lesson_plan_bp.route('/api/ai/lesson-plan/<int:plan_id>', methods=['DELETE'])
@require_role('teacher')
def api_delete_lesson_plan(plan_id):
    try:
        lesson_plan_service.delete_plan(plan_id)
        return success_response(message="Lesson plan deleted")
    except LessonPlanNotFoundError as e:
        return error_response(str(e), status=404)
