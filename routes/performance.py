"""
Performance Analysis routes (Blueprint) — AI Tools.
Thin HTTP layer — all logic lives in services/performance_analysis_service.py.
Read-only: analyzes existing exam data, writes nothing.
"""
from flask import Blueprint, request

from repositories.performance_repository import PerformanceRepository
from repositories.settings_repository import SettingsRepository
from services.performance_analysis_service import PerformanceAnalysisService, PerformanceStudentNotFoundError
from utils.auth import require_role
from utils.response import success_response, error_response

performance_bp = Blueprint('performance', __name__)

performance_repository = PerformanceRepository()
settings_repository = SettingsRepository()
performance_service = PerformanceAnalysisService(performance_repository, settings_repository)


@performance_bp.route('/api/ai/performance/<student_id>', methods=['GET'])
@require_role('viewer')
def api_analyze_student_performance(student_id):
    mode = request.args.get('mode', 'auto')
    try:
        return success_response(performance_service.analyze_student(student_id, mode=mode))
    except PerformanceStudentNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)
