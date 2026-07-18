"""
Fee Prediction routes (Blueprint) — AI Tools.
Thin HTTP layer — all logic lives in services/fee_prediction_service.py.
Read-only: analyzes existing fee records, writes nothing.
"""
from flask import Blueprint, request

from repositories.fee_prediction_repository import FeePredictionRepository
from repositories.settings_repository import SettingsRepository
from services.fee_prediction_service import FeePredictionService, FeePredictionStudentNotFoundError
from utils.auth import require_role
from utils.response import success_response, error_response

fee_prediction_bp = Blueprint('fee_prediction', __name__)

fee_prediction_repository = FeePredictionRepository()
settings_repository = SettingsRepository()
fee_prediction_service = FeePredictionService(fee_prediction_repository, settings_repository)


@fee_prediction_bp.route('/api/ai/fee-prediction/class', methods=['GET'])
@require_role('viewer')
def api_fee_prediction_class():
    class_name = request.args.get('class_name', '').strip() or None
    mode = request.args.get('mode', 'auto')
    try:
        return success_response(fee_prediction_service.analyze_class(class_name, mode=mode))
    except Exception as e:
        return error_response(str(e), status=500)


@fee_prediction_bp.route('/api/ai/fee-prediction/student/<student_id>', methods=['GET'])
@require_role('viewer')
def api_fee_prediction_student(student_id):
    mode = request.args.get('mode', 'auto')
    try:
        return success_response(fee_prediction_service.analyze_student(student_id, mode=mode))
    except FeePredictionStudentNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)
