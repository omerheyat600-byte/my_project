"""
Report Card Remarks routes (Blueprint) — AI Tools.
Thin HTTP layer — all logic lives in services/remarks_service.py.
"""
from flask import Blueprint, request, session

from repositories.exam_repository import ExamRepository
from repositories.report_card_remarks_repository import ReportCardRemarksRepository
from repositories.settings_repository import SettingsRepository
from services.remarks_service import (
    RemarksService, RemarksExamNotFoundError, RemarksStudentNotFoundError, RemarksValidationError
)
from utils.auth import require_role
from utils.response import success_response, error_response

remarks_bp = Blueprint('remarks', __name__)

exam_repository = ExamRepository()
remarks_repository = ReportCardRemarksRepository()
settings_repository = SettingsRepository()
remarks_service = RemarksService(exam_repository, remarks_repository, settings_repository)


def _current_user():
    return session.get('username') or session.get('user_id')


@remarks_bp.route('/api/ai/remarks/<int:exam_id>', methods=['GET'])
@require_role('viewer')
def api_get_remarks_for_exam(exam_id):
    try:
        return success_response(remarks_service.get_remarks_for_exam(exam_id))
    except RemarksExamNotFoundError as e:
        return error_response(str(e), status=404)


@remarks_bp.route('/api/ai/remarks/generate', methods=['POST'])
@require_role('teacher')
def api_generate_remark():
    data = request.json or {}
    exam_id = data.get('exam_id')
    student_id = (data.get('student_id') or '').strip()
    if not exam_id or not student_id:
        return error_response("exam_id and student_id are required", status=400)
    try:
        remark = remarks_service.generate_for_student(
            exam_id, student_id,
            mode=data.get('mode', 'auto'),
            tone=data.get('tone', 'encouraging'),
            created_by=_current_user(),
        )
        return success_response({"remark": remark}, message="Remark generated")
    except (RemarksExamNotFoundError, RemarksStudentNotFoundError) as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@remarks_bp.route('/api/ai/remarks/generate-bulk', methods=['POST'])
@require_role('teacher')
def api_generate_remarks_bulk():
    data = request.json or {}
    exam_id = data.get('exam_id')
    if not exam_id:
        return error_response("exam_id is required", status=400)
    try:
        result = remarks_service.generate_bulk(
            exam_id,
            mode=data.get('mode', 'auto'),
            tone=data.get('tone', 'encouraging'),
            created_by=_current_user(),
            overwrite_existing=bool(data.get('overwrite_existing', False)),
        )
        return success_response(result, message=f"Generated {result['generated']} remark(s)")
    except RemarksExamNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@remarks_bp.route('/api/ai/remarks/<int:exam_id>/<student_id>', methods=['PUT'])
@require_role('teacher')
def api_save_remark_manual(exam_id, student_id):
    data = request.json or {}
    try:
        remark = remarks_service.save_manual(
            exam_id, student_id,
            overall_remark=data.get('overall_remark', ''),
            strengths=data.get('strengths', ''),
            improvement_areas=data.get('improvement_areas', ''),
            created_by=_current_user(),
        )
        return success_response({"remark": remark}, message="Remark saved")
    except RemarksValidationError as e:
        return error_response("; ".join(e.errors), status=400)


@remarks_bp.route('/api/ai/remarks/<int:exam_id>/<student_id>', methods=['DELETE'])
@require_role('teacher')
def api_delete_remark(exam_id, student_id):
    remarks_service.delete_remark(exam_id, student_id)
    return success_response(message="Remark deleted")
